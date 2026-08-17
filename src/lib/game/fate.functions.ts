import { createServerFn } from "@tanstack/react-start";
import type { Firestore } from "firebase-admin/firestore";

import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import type { ChatMessage } from "./types";

const HEX_CHANCE = 0.2;
const CURSE_CHANCE = 0.02;
const COUNTDOWN_MIN = 6;
const COUNTDOWN_MAX = 10;

type HexResult = {
  won: boolean;
  pick: "even" | "odd";
  roll: number;
  parity: "even" | "odd";
};

type LastChanceResult = {
  survived: boolean;
  correct: number;
  guesses: ("higher" | "lower")[];
};

type FateEvent = {
  type: "hex" | "last_chance";
  ownerId: string;
  status: "pending" | "resolved";
  payload: { roll?: number; cards?: number[] };
  result?: HexResult | LastChanceResult;
  createdAt: Date;
  resolvedAt?: Date;
};

async function verifySaveOwnership(db: Firestore, saveId: string, userId: string) {
  const snap = await db.collection("adventures").doc(saveId).get();
  if (!snap.exists || snap.data()?.ownerId !== userId || snap.data()?.deleting === true) {
    throw new Error("Adventure not found");
  }
}

async function createFateEvent(db: Firestore, saveId: string, userId: string, event: FateEvent) {
  const adventureRef = db.collection("adventures").doc(saveId);
  const ref = adventureRef.collection("events").doc();
  await db.runTransaction(async (transaction) => {
    const adventure = await transaction.get(adventureRef);
    if (
      !adventure.exists ||
      adventure.data()?.ownerId !== userId ||
      adventure.data()?.deleting === true
    ) {
      throw new Error("Adventure not found");
    }
    transaction.set(ref, event);
  });
  return ref;
}

function eventRef(db: Firestore, saveId: string, eventId: string) {
  return db.collection("adventures").doc(saveId).collection("events").doc(eventId);
}

export const rollPreTurnHex = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator(
    (data: {
      saveId: string;
      hexesEnabled: boolean;
      isLocked: boolean;
      hasPendingEvent: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    if (!data.hexesEnabled || data.isLocked || data.hasPendingEvent) {
      return { event: null as null | { eventId: string; roll: number } };
    }
    if (Math.random() >= HEX_CHANCE) return { event: null };

    const roll = 1 + Math.floor(Math.random() * 6);
    const event: FateEvent = {
      type: "hex",
      ownerId: context.userId,
      status: "pending",
      payload: { roll },
      createdAt: new Date(),
    };
    const ref = await createFateEvent(context.adminDb, data.saveId, context.userId, event);
    return { event: { eventId: ref.id, roll } };
  });

export const resolveHexEvent = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { saveId: string; eventId: string; pick: "even" | "odd" }) => data)
  .handler(async ({ data, context }) => {
    return context.adminDb.runTransaction<HexResult>(async (tx) => {
      const adventure = await tx.get(context.adminDb.collection("adventures").doc(data.saveId));
      if (
        !adventure.exists ||
        adventure.data()?.ownerId !== context.userId ||
        adventure.data()?.deleting === true
      ) {
        throw new Error("Adventure not found");
      }
      const ref = eventRef(context.adminDb, data.saveId, data.eventId);
      const snap = await tx.get(ref);
      const row = snap.data() as FateEvent | undefined;
      if (!row || row.ownerId !== context.userId || row.type !== "hex") {
        throw new Error("Hex event not found");
      }
      if (row.status === "resolved" && row.result) return row.result as HexResult;

      const roll = Number(row.payload.roll ?? 0);
      const parity: "even" | "odd" = roll % 2 === 0 ? "even" : "odd";
      const won = data.pick === parity;
      const result = { won, pick: data.pick, roll, parity };
      tx.update(ref, { status: "resolved", result, resolvedAt: new Date() });
      return result;
    });
  });

export const rollCurseAndDescribe = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator(
    (data: {
      saveId: string;
      deathEnabled: boolean;
      curseAlreadyActive: boolean;
      isLocked: boolean;
      story_context: string;
      model: string;
      force?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    if (data.isLocked || data.curseAlreadyActive || !data.deathEnabled) {
      return { triggered: false as const };
    }
    if (!data.force && Math.random() >= CURSE_CHANCE) {
      return { triggered: false as const };
    }

    await verifySaveOwnership(context.adminDb, data.saveId, context.userId);
    const remaining =
      COUNTDOWN_MIN + Math.floor(Math.random() * (COUNTDOWN_MAX - COUNTDOWN_MIN + 1));
    const { callChatByModel } = await import("./ai.server");
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You invent a doom for a choose-your-own-adventure protagonist. The doom is a slow-burn threat that will unfold over the next few scenes. Choose one specific threat that arises organically from the supplied story. Describe it in one or two sentences. Never mention game mechanics. Return only the doom text.",
      },
      {
        role: "user",
        content: `Story context:\n${data.story_context.slice(0, 12_000)}\n\nInvent the specific doom that has just taken hold.`,
      },
    ];
    const raw = await callChatByModel(messages, data.model, {
      plainText: true,
      temperature: 1,
      maxTokens: 300,
    });
    const description = raw.trim().replace(/^["'\s]+|["'\s]+$/g, "");
    return { triggered: true as const, description, remaining };
  });

export const startLastChance = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { saveId: string }) => data)
  .handler(async ({ data, context }) => {
    const cards = Array.from({ length: 15 }, () => 2 + Math.floor(Math.random() * 13));
    const event: FateEvent = {
      type: "last_chance",
      ownerId: context.userId,
      status: "pending",
      payload: { cards },
      createdAt: new Date(),
    };
    const ref = await createFateEvent(context.adminDb, data.saveId, context.userId, event);
    return { eventId: ref.id, cards };
  });

export const resolveLastChance = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { saveId: string; eventId: string; guesses: ("higher" | "lower")[] }) => data)
  .handler(async ({ data, context }) => {
    return context.adminDb.runTransaction<LastChanceResult>(async (tx) => {
      const adventure = await tx.get(context.adminDb.collection("adventures").doc(data.saveId));
      if (
        !adventure.exists ||
        adventure.data()?.ownerId !== context.userId ||
        adventure.data()?.deleting === true
      ) {
        throw new Error("Adventure not found");
      }
      const ref = eventRef(context.adminDb, data.saveId, data.eventId);
      const snap = await tx.get(ref);
      const row = snap.data() as FateEvent | undefined;
      if (!row || row.ownerId !== context.userId || row.type !== "last_chance") {
        throw new Error("Last-chance event not found");
      }
      if (row.status === "resolved") throw new Error("Event already resolved");
      const cards = [...(row.payload.cards ?? [])];
      if (cards.length < 2) throw new Error("Malformed deck");

      let index = 0;
      let streak = 0;
      let survived = false;
      let died = false;
      for (const guess of data.guesses.slice(0, 14)) {
        if (index + 1 >= cards.length) break;
        const current = cards[index];
        const next = cards[index + 1];
        index += 1;
        if (next === current) continue;
        const correct = next > current === (guess === "higher");
        if (correct) {
          streak += 1;
          if (streak >= 3) {
            survived = true;
            break;
          }
        } else {
          died = true;
          break;
        }
      }
      if (!survived && !died) died = true;
      const result = { survived, correct: streak, guesses: data.guesses.slice(0, 14) };
      tx.update(ref, { status: "resolved", result, resolvedAt: new Date() });
      return result;
    });
  });

export const getPendingFateEvent = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .validator((data: { saveId: string }) => data)
  .handler(async ({ data, context }) => {
    await verifySaveOwnership(context.adminDb, data.saveId, context.userId);
    const snapshot = await context.adminDb
      .collection("adventures")
      .doc(data.saveId)
      .collection("events")
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    if (!doc) {
      return {
        event: null as null | {
          id: string;
          type: "hex" | "last_chance";
          roll: number | null;
          cards: number[] | null;
        },
      };
    }
    const row = doc.data() as FateEvent;
    return {
      event: {
        id: doc.id,
        type: row.type,
        roll: typeof row.payload.roll === "number" ? row.payload.roll : null,
        cards: Array.isArray(row.payload.cards) ? row.payload.cards.map(Number) : null,
      },
    };
  });
