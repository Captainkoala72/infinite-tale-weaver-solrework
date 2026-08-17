import type { Firestore } from "firebase-admin/firestore";

export type AiUsageKind = "chat" | "image" | "video" | "tts";

const DEFAULT_LIMITS: Record<AiUsageKind, number> = {
  chat: 250,
  image: 40,
  video: 6,
  tts: 100,
};

function configuredLimit(kind: AiUsageKind): number {
  const raw = process.env[`AI_DAILY_${kind.toUpperCase()}_LIMIT`];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMITS[kind];
}

export async function enforceAiUsage(
  db: Firestore,
  userId: string,
  kind: AiUsageKind,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const ref = db.collection("users").doc(userId).collection("usage").doc(day);
  const limit = configuredLimit(kind);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = Number(snapshot.data()?.[kind] ?? 0);
    if (current >= limit) {
      throw new Error(`Daily ${kind} generation limit reached. Try again tomorrow.`);
    }
    transaction.set(
      ref,
      {
        ownerId: userId,
        day,
        [kind]: current + 1,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  });
}
