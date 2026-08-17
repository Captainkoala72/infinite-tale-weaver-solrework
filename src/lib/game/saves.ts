import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { deleteObject, list, ref as storageRef } from "firebase/storage";

import { requireUser } from "@/integrations/firebase/auth";
import { firebaseStorage, firestore } from "@/integrations/firebase/client";
import {
  DEFAULT_FATE,
  EMPTY_APPEARANCE,
  ensureFate,
  type ChatMessage,
  type GameState,
  type SceneRecord,
} from "./types";

const SCHEMA_VERSION = 2;
const MAX_LISTED_SAVES = 100;
const MAX_NEW_SCENES_PER_UPDATE = 450;

export type SaveRow = {
  id: string;
  user_id: string;
  title: string;
  genre: string | null;
  state: GameState;
  created_at: string;
  updated_at: string;
  protagonist_name?: string;
  tone?: string;
  scene_count?: number;
  cover_image_url?: string | null;
};

type AdventureDocument = {
  ownerId: string;
  title: string;
  genre: string;
  tone: string;
  protagonistName: string;
  artStyle: string;
  model: string;
  preview: string;
  sceneCount: number;
  historyCount: number;
  coverImageUrl: string | null;
  latestSceneId: string | null;
  deleting: boolean;
  schemaVersion: number;
  createdAt: unknown;
  updatedAt: unknown;
};

type CurrentStateDocument = Omit<GameState, "history" | "scenes"> & {
  schemaVersion: number;
  updatedAt: unknown;
};

type SceneDocument = {
  id: string;
  index: number;
  narration: string;
  choices: string[];
  imagePrompt: string;
  imageUrl: string | null;
  historyEntries: ChatMessage[];
  createdAt: unknown;
  updatedAt: unknown;
};

function toIso(value: unknown, fallback = new Date().toISOString()): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return date.toISOString();
  }
  if (typeof value === "string") return value;
  return fallback;
}

function cleanForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalize(row: SaveRow): SaveRow {
  return { ...row, state: ensureFate(row.state) };
}

function metadataState(id: string, data: AdventureDocument): GameState {
  const createdAt = toIso(data.createdAt);
  const previewScene: SceneRecord[] = data.preview
    ? [
        {
          id: `preview-${id}`,
          image_data_url: data.coverImageUrl,
          image_prompt: "",
          narration: data.preview,
          choices: [],
        },
      ]
    : [];

  return {
    meta: {
      title: data.title,
      genre: data.genre,
      tone: data.tone,
      protagonist: "",
      protagonist_name: data.protagonistName,
      appearance: { ...EMPTY_APPEARANCE },
      art_style: data.artStyle,
      created_at: createdAt,
    },
    inventory: [],
    quests: [],
    codex: {},
    world: { locations: {}, factions: {}, reputation: {}, facts: [] },
    history: [],
    scenes: previewScene,
    current_choices: [],
    current_voice_request: null,
    model: data.model,
    fate: { ...DEFAULT_FATE },
    fate_markers: [],
  };
}

function metadataRow(snapshot: QueryDocumentSnapshot<DocumentData>): SaveRow {
  const data = snapshot.data() as AdventureDocument;
  return {
    id: snapshot.id,
    user_id: data.ownerId,
    title: data.title,
    genre: data.genre || null,
    state: metadataState(snapshot.id, data),
    created_at: toIso(data.createdAt),
    updated_at: toIso(data.updatedAt),
    protagonist_name: data.protagonistName,
    tone: data.tone,
    scene_count: data.sceneCount,
    cover_image_url: data.coverImageUrl,
  };
}

function currentStateDocument(state: GameState): Omit<CurrentStateDocument, "updatedAt"> {
  const { history: _history, scenes: _scenes, ...current } = state;
  return cleanForFirestore({
    ...current,
    schemaVersion: SCHEMA_VERSION,
  });
}

function sceneDocument(
  scene: SceneRecord,
  index: number,
  historyEntries: ChatMessage[],
): Omit<SceneDocument, "createdAt" | "updatedAt"> {
  return cleanForFirestore({
    id: scene.id,
    index,
    narration: scene.narration,
    choices: scene.choices,
    imagePrompt: scene.image_prompt,
    imageUrl:
      typeof scene.image_data_url === "string" && scene.image_data_url.startsWith("https://")
        ? scene.image_data_url
        : null,
    historyEntries,
  });
}

function adventureMetadata(
  ownerId: string,
  title: string,
  genre: string,
  state: GameState,
  now: unknown,
): AdventureDocument {
  return {
    ownerId,
    title,
    genre,
    tone: state.meta.tone,
    protagonistName: state.meta.protagonist_name,
    artStyle: state.meta.art_style,
    model: state.model,
    preview: state.scenes.at(-1)?.narration.slice(0, 500) ?? "",
    sceneCount: state.scenes.length,
    historyCount: state.history.length,
    coverImageUrl: null,
    latestSceneId: state.scenes.at(-1)?.id ?? null,
    deleting: false,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listSaves(): Promise<SaveRow[]> {
  const user = await requireUser();
  const savesQuery = query(
    collection(firestore, "adventures"),
    where("ownerId", "==", user.uid),
    orderBy("updatedAt", "desc"),
    limit(MAX_LISTED_SAVES),
  );
  const snapshot = await getDocs(savesQuery);
  return snapshot.docs
    .filter((item) => (item.data() as AdventureDocument).deleting !== true)
    .map(metadataRow)
    .map(normalize);
}

export async function getSave(id: string): Promise<SaveRow> {
  const user = await requireUser();
  const adventureRef = doc(firestore, "adventures", id);
  const stateRef = doc(adventureRef, "state", "current");
  const scenesQuery = query(collection(adventureRef, "scenes"), orderBy("index", "asc"));
  const [adventureSnapshot, stateSnapshot, scenesSnapshot] = await Promise.all([
    getDoc(adventureRef),
    getDoc(stateRef),
    getDocs(scenesQuery),
  ]);

  if (!adventureSnapshot.exists() || !stateSnapshot.exists()) {
    throw new Error("Adventure not found.");
  }

  const metadata = adventureSnapshot.data() as AdventureDocument;
  if (metadata.ownerId !== user.uid || metadata.deleting) {
    throw new Error("Adventure not found.");
  }

  const storedCurrent = stateSnapshot.data() as CurrentStateDocument;
  const { schemaVersion: _schemaVersion, updatedAt: _stateUpdatedAt, ...current } = storedCurrent;
  const history: ChatMessage[] = [];
  const scenes: SceneRecord[] = scenesSnapshot.docs.map((sceneSnapshot) => {
    const scene = sceneSnapshot.data() as SceneDocument;
    if (Array.isArray(scene.historyEntries)) history.push(...scene.historyEntries);
    return {
      id: scene.id || sceneSnapshot.id,
      image_data_url: scene.imageUrl ?? null,
      image_prompt: scene.imagePrompt,
      narration: scene.narration,
      choices: scene.choices,
    };
  });
  const state = ensureFate({ ...current, history, scenes } as GameState);

  return {
    id,
    user_id: metadata.ownerId,
    title: metadata.title,
    genre: metadata.genre || null,
    state,
    created_at: toIso(metadata.createdAt, state.meta.created_at),
    updated_at: toIso(metadata.updatedAt),
    protagonist_name: metadata.protagonistName,
    tone: metadata.tone,
    scene_count: metadata.sceneCount,
    cover_image_url: metadata.coverImageUrl,
  };
}

export async function createSave(title: string, genre: string, state: GameState): Promise<SaveRow> {
  const user = await requireUser();
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("An adventure title is required.");
  if (cleanTitle.length > 120) throw new Error("Adventure titles must be 120 characters or fewer.");

  const adventureRef = doc(collection(firestore, "adventures"));
  const stateRef = doc(adventureRef, "state", "current");
  const now = Timestamp.now();
  const metadata = adventureMetadata(user.uid, cleanTitle, genre, state, now);
  if (state.scenes.length > MAX_NEW_SCENES_PER_UPDATE) {
    throw new Error("Too many scenes were supplied while creating this adventure.");
  }
  const batch = writeBatch(firestore);
  batch.set(adventureRef, metadata);
  batch.set(stateRef, { ...currentStateDocument(state), updatedAt: now });
  state.scenes.forEach((scene, index) => {
    batch.set(doc(adventureRef, "scenes", scene.id), {
      ...sceneDocument(scene, index, index === 0 ? state.history : []),
      createdAt: now,
      updatedAt: now,
    });
  });
  await batch.commit();

  return normalize({
    id: adventureRef.id,
    user_id: user.uid,
    title: cleanTitle,
    genre: genre || null,
    state,
    created_at: now.toDate().toISOString(),
    updated_at: now.toDate().toISOString(),
    protagonist_name: state.meta.protagonist_name,
    tone: state.meta.tone,
    scene_count: state.scenes.length,
    cover_image_url: null,
  });
}

export async function updateSaveState(id: string, state: GameState): Promise<void> {
  await requireUser();
  const adventureRef = doc(firestore, "adventures", id);
  const stateRef = doc(adventureRef, "state", "current");

  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(adventureRef);
    if (!snapshot.exists()) throw new Error("Adventure not found.");
    const metadata = snapshot.data() as AdventureDocument;
    const existingSceneCount = metadata.sceneCount ?? 0;
    const existingHistoryCount = metadata.historyCount ?? 0;

    if (metadata.deleting) throw new Error("This adventure is being deleted.");

    if (state.scenes.length < existingSceneCount || state.history.length < existingHistoryCount) {
      throw new Error("This adventure changed in another tab. Reload before saving again.");
    }

    const localLatestSceneId =
      existingSceneCount > 0 ? (state.scenes[existingSceneCount - 1]?.id ?? null) : null;
    if ((metadata.latestSceneId ?? null) !== localLatestSceneId) {
      throw new Error("This adventure continued in another tab. Reload to use the latest branch.");
    }

    const newScenes = state.scenes.slice(existingSceneCount);
    if (newScenes.length > MAX_NEW_SCENES_PER_UPDATE) {
      throw new Error("Too many new scenes were added in one save operation.");
    }

    const now = serverTimestamp();
    const newHistory = state.history.slice(existingHistoryCount);
    newScenes.forEach((scene, offset) => {
      const index = existingSceneCount + offset;
      const target = doc(adventureRef, "scenes", scene.id);
      transaction.set(target, {
        ...sceneDocument(scene, index, offset === 0 ? newHistory : []),
        createdAt: now,
        updatedAt: now,
      });
    });

    transaction.set(stateRef, {
      ...currentStateDocument(state),
      updatedAt: now,
    });
    transaction.update(adventureRef, {
      title: state.meta.title,
      genre: state.meta.genre,
      tone: state.meta.tone,
      protagonistName: state.meta.protagonist_name,
      artStyle: state.meta.art_style,
      model: state.model,
      preview: state.scenes.at(-1)?.narration.slice(0, 500) ?? "",
      sceneCount: state.scenes.length,
      historyCount: state.history.length,
      latestSceneId: state.scenes.at(-1)?.id ?? null,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now,
    });
  });
}

async function deleteDocuments(path: "scenes" | "events", adventureId: string): Promise<void> {
  while (true) {
    const snapshot = await getDocs(
      query(
        collection(firestore, "adventures", adventureId, path),
        limit(MAX_NEW_SCENES_PER_UPDATE),
      ),
    );
    if (!snapshot.docs.length) return;
    const batch = writeBatch(firestore);
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
}

export async function deleteSave(id: string): Promise<void> {
  const user = await requireUser();
  const adventureRef = doc(firestore, "adventures", id);
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(adventureRef);
    if (!snapshot.exists() || snapshot.data().ownerId !== user.uid) {
      throw new Error("Adventure not found.");
    }
    if (!snapshot.data().deleting) {
      transaction.update(adventureRef, { deleting: true, updatedAt: serverTimestamp() });
    }
  });

  const mediaFolder = storageRef(firebaseStorage, `users/${user.uid}/adventures/${id}/scenes`);
  while (true) {
    const media = await list(mediaFolder, { maxResults: 1000 });
    if (!media.items.length) break;
    await Promise.all(media.items.map((item) => deleteObject(item)));
  }

  await deleteDocuments("scenes", id);
  await deleteDocuments("events", id);
  const batch = writeBatch(firestore);
  batch.delete(doc(adventureRef, "state", "current"));
  batch.delete(adventureRef);
  await batch.commit();
}

export async function renameSave(id: string, title: string): Promise<void> {
  await requireUser();
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("An adventure title is required.");
  if (cleanTitle.length > 120) throw new Error("Adventure titles must be 120 characters or fewer.");

  const adventureRef = doc(firestore, "adventures", id);
  const batch = writeBatch(firestore);
  batch.update(adventureRef, { title: cleanTitle, updatedAt: serverTimestamp() });
  batch.update(doc(adventureRef, "state", "current"), {
    "meta.title": cleanTitle,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function duplicateSaveSetup(id: string): Promise<SaveRow> {
  const user = await requireUser();
  const adventureRef = doc(firestore, "adventures", id);
  const [adventureSnapshot, stateSnapshot] = await Promise.all([
    getDoc(adventureRef),
    getDoc(doc(adventureRef, "state", "current")),
  ]);
  if (!adventureSnapshot.exists() || !stateSnapshot.exists()) {
    throw new Error("Adventure not found.");
  }
  const metadata = adventureSnapshot.data() as AdventureDocument;
  if (metadata.ownerId !== user.uid || metadata.deleting) {
    throw new Error("Adventure not found.");
  }
  const storedCurrent = stateSnapshot.data() as CurrentStateDocument;
  const { schemaVersion: _schemaVersion, updatedAt: _updatedAt, ...current } = storedCurrent;
  const sourceState = ensureFate({ ...current, history: [], scenes: [] } as GameState);
  const protagonistName = sourceState.meta.protagonist_name;
  const protagonistCodex = sourceState.codex[protagonistName];
  const duplicateTitle = `${metadata.title} — Copy`.slice(0, 120);
  const state: GameState = {
    ...sourceState,
    meta: {
      ...sourceState.meta,
      title: duplicateTitle,
      created_at: new Date().toISOString(),
    },
    inventory: [],
    quests: [],
    codex: protagonistCodex ? { [protagonistName]: protagonistCodex } : {},
    world: { locations: {}, factions: {}, reputation: {}, facts: [] },
    history: [],
    scenes: [],
    current_choices: [],
    current_voice_request: null,
    fate: {
      ...DEFAULT_FATE,
      death_enabled: sourceState.fate.death_enabled,
      hexes_enabled: sourceState.fate.hexes_enabled,
    },
    fate_markers: [],
  };
  return createSave(duplicateTitle, metadata.genre || sourceState.meta.genre, state);
}

export async function exportSaveData(id: string): Promise<string> {
  const save = await getSave(id);
  return JSON.stringify(
    {
      format: "infinite-tale-weaver",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      adventure: save,
    },
    null,
    2,
  );
}
