export type Role = "system" | "user" | "assistant";

export type ChatMessage = {
  role: Role;
  content: string;
};

export type InventoryItem = {
  name: string;
  description: string;
};

export type Quest = {
  id: string;
  title: string;
  status: "active" | "done" | "failed";
  notes: string;
};

export type CodexEntry = {
  dna: string; // Full character DNA including art style
  personality: string;
  last_seen: string;
};

export type SceneRecord = {
  id: string; // turn index or uuid
  image_data_url: string | null;
  image_prompt: string;
  narration: string;
  choices: string[];
};

export type VoiceRequest = {
  voice_mode: true;
  character_name: string;
  character_profile: string;
  context: string;
  allowed_actions: string[];
  restrictions: string[];
};

export type StateDelta = {
  inventory_add?: InventoryItem[];
  inventory_remove?: string[]; // by name
  quest_updates?: Quest[]; // upsert by id
  codex_updates?: Record<string, CodexEntry>;
  world_updates?: {
    locations?: Record<string, string>;
    factions?: Record<string, string>;
    reputation?: Record<string, number>;
    facts?: string[];
  };
};

export type TurnResponse = {
  narration: string;
  choices: string[];
  image_prompt: string;
  state_delta: StateDelta;
  voice_request: VoiceRequest | null;
};

export type Appearance = {
  gender: string;
  age: string;
  height: string;
  build: string;
  skin: string;
  hair_style: string;
  hair_color: string;
  eyes: string;
  glasses: string;
  facial_hair: string;
  tattoos: string;
  scars: string;
  outfit: string;
  extras: string;
};

export const EMPTY_APPEARANCE: Appearance = {
  gender: "",
  age: "",
  height: "",
  build: "",
  skin: "",
  hair_style: "",
  hair_color: "",
  eyes: "",
  glasses: "",
  facial_hair: "",
  tattoos: "",
  scars: "",
  outfit: "",
  extras: "",
};

export function buildCharacterDNA(name: string, a: Appearance): string {
  const parts: string[] = [];
  parts.push(`Name: ${name || "the protagonist"}`);
  if (a.gender) parts.push(`Gender presentation: ${a.gender}`);
  if (a.age) parts.push(`Age: ${a.age}`);
  const bh: string[] = [];
  if (a.height) bh.push(a.height);
  if (a.build) bh.push(`${a.build} build`);
  if (bh.length) parts.push(`Height/build: ${bh.join(", ")}`);
  if (a.skin) parts.push(`Skin tone: ${a.skin}`);
  const hair = [a.hair_style, a.hair_color].filter(Boolean).join(", ");
  if (hair) parts.push(`Hair: ${hair}`);
  if (a.eyes) parts.push(`Eyes: ${a.eyes}`);
  if (a.glasses && a.glasses !== "none") parts.push(`Glasses: ${a.glasses}`);
  if (a.facial_hair && a.facial_hair !== "none") parts.push(`Facial hair: ${a.facial_hair}`);
  if (a.tattoos) parts.push(`Tattoos: ${a.tattoos}`);
  if (a.scars) parts.push(`Scars/markings: ${a.scars}`);
  if (a.outfit) parts.push(`Signature outfit: ${a.outfit}`);
  if (a.extras) parts.push(`Distinguishing features: ${a.extras}`);
  return parts.join(". ") + ".";
}

/**
 * Build a short, imperative lock line to prepend to every image prompt.
 * Image models often drift on gender when the prompt is long — putting the
 * non-negotiables at the front, in plain terms, keeps them stable.
 */
export function buildAppearanceLock(name: string, a: Appearance): string {
  const bits: string[] = [];
  if (a.gender) {
    const g = a.gender.toLowerCase();
    if (g === "man") bits.push("an adult man (male, masculine features)");
    else if (g === "woman") bits.push("an adult woman (female, feminine features)");
    else if (g === "non-binary") bits.push("a non-binary person (androgynous features)");
    else bits.push(`a person with ${a.gender.toLowerCase()} presentation`);
  }
  if (a.age) bits.push(a.age.toLowerCase());
  if (a.skin) bits.push(`${a.skin.toLowerCase()} skin`);
  const hair = [a.hair_color, a.hair_style].filter(Boolean).join(" ").trim().toLowerCase();
  if (hair) bits.push(`${hair} hair`);
  if (a.eyes) bits.push(`${a.eyes.toLowerCase()} eyes`);
  if (a.facial_hair && a.facial_hair !== "none") bits.push(`${a.facial_hair.toLowerCase()}`);
  if (a.glasses && a.glasses !== "none") bits.push(`wearing ${a.glasses.toLowerCase()}`);
  if (!bits.length) return "";
  const who = name || "the protagonist";
  return `STRICT SUBJECT LOCK — ${who} is ${bits.join(", ")}. This gender and these features are fixed and MUST match exactly. Do not change the character's gender under any circumstance.`;
}

export type SportsConfig = {
  sport: string;
  career_type: string;
  starting_point: string;
};

export type CharacterProfile = {
  background: string;
  personality: string;
  goal: string;
  flaw: string;
};

export type FateState = {
  death_enabled: boolean;
  hexes_enabled: boolean;
  curse_active: boolean;
  curse_description: string | null;
  curse_messages_remaining: number | null;
  is_locked: boolean;
  pending_event_id: string | null;
  // Applied to the NEXT turn only, then cleared:
  next_hex_modifier: "win" | "lose" | null;
  survived_last_chance: boolean;
  // Non-lethal misfortune from a hex loss when death is off:
  misfortune_remaining: number;
};

export const DEFAULT_FATE: FateState = {
  death_enabled: false,
  hexes_enabled: false,
  curse_active: false,
  curse_description: null,
  curse_messages_remaining: null,
  is_locked: false,
  pending_event_id: null,
  next_hex_modifier: null,
  survived_last_chance: false,
  misfortune_remaining: 0,
};

export type FateMarker = {
  id: string;
  kind: "hex" | "last_chance_survived" | "last_chance_lost" | "death";
  text: string;
  at_scene_index: number;
};

export type GameState = {
  meta: {
    title: string;
    genre: string;
    tone: string;
    premise?: string;
    protagonist: string;
    protagonist_name: string;
    character?: CharacterProfile;
    appearance: Appearance;
    sports?: SportsConfig;
    art_style: string;
    created_at: string;
    narrator_voice?: string;
    narrator_font?: string;
    image_enabled?: boolean;
    image_model?: string;
    video_enabled?: boolean;
    video_model?: string;
  };
  inventory: InventoryItem[];
  quests: Quest[];
  codex: Record<string, CodexEntry>;
  world: {
    locations: Record<string, string>;
    factions: Record<string, string>;
    reputation: Record<string, number>;
    facts: string[];
  };
  history: ChatMessage[];
  scenes: SceneRecord[];
  current_choices: string[];
  current_voice_request: VoiceRequest | null;
  model: string;
  fate: FateState;
  fate_markers: FateMarker[];
};

export function newGameState(input: {
  title: string;
  genre: string;
  tone: string;
  premise?: string;
  protagonist: string;
  protagonist_name?: string;
  character?: CharacterProfile;
  appearance?: Appearance;
  sports?: SportsConfig;
  art_style?: string;
  model?: string;
  narrator_voice?: string;
  narrator_font?: string;
  image_enabled?: boolean;
  image_model?: string;
  video_enabled?: boolean;
  video_model?: string;
  death_enabled?: boolean;
  hexes_enabled?: boolean;
}): GameState {
  const appearance = input.appearance ?? EMPTY_APPEARANCE;
  const name = input.protagonist_name?.trim() || "Protagonist";
  const codex: Record<string, CodexEntry> = {};
  const hasAppearance = Object.values(appearance).some((v) => v && v !== "none");
  if (hasAppearance || input.protagonist_name) {
    codex[name] = {
      dna: buildCharacterDNA(name, appearance),
      personality: input.protagonist.trim(),
      last_seen: "opening scene",
    };
  }
  return {
    meta: {
      title: input.title,
      genre: input.genre,
      tone: input.tone,
      ...(input.premise ? { premise: input.premise } : {}),
      protagonist: input.protagonist,
      protagonist_name: name,
      ...(input.character ? { character: input.character } : {}),
      appearance,
      ...(input.sports ? { sports: input.sports } : {}),
      art_style: input.art_style ?? "",
      created_at: new Date().toISOString(),
      ...(input.narrator_voice ? { narrator_voice: input.narrator_voice } : {}),
      ...(input.narrator_font ? { narrator_font: input.narrator_font } : {}),
      image_enabled: input.image_enabled ?? true,
      ...(input.image_model ? { image_model: input.image_model } : {}),
      video_enabled: !!input.video_enabled,
      ...(input.video_model ? { video_model: input.video_model } : {}),
    },
    inventory: [],
    quests: [],
    codex,
    world: { locations: {}, factions: {}, reputation: {}, facts: [] },
    history: [],
    scenes: [],
    current_choices: [],
    current_voice_request: null,
    model: input.model ?? "gemini-3.6-flash",
    fate: {
      ...DEFAULT_FATE,
      death_enabled: !!input.death_enabled,
      hexes_enabled: !!input.hexes_enabled,
    },
    fate_markers: [],
  };
}

/** Older saves may predate the fate feature — normalize on load. */
export function ensureFate(state: GameState): GameState {
  if (state.fate && state.fate_markers) return state;
  return {
    ...state,
    fate: state.fate ?? { ...DEFAULT_FATE },
    fate_markers: state.fate_markers ?? [],
  };
}

export function applyDelta(state: GameState, delta: StateDelta): GameState {
  const next: GameState = JSON.parse(JSON.stringify(state));
  if (delta.inventory_add?.length) {
    for (const item of delta.inventory_add) {
      if (!next.inventory.some((i) => i.name.toLowerCase() === item.name.toLowerCase())) {
        next.inventory.push(item);
      }
    }
  }
  if (delta.inventory_remove?.length) {
    const removeSet = new Set(delta.inventory_remove.map((n) => n.toLowerCase()));
    next.inventory = next.inventory.filter((i) => !removeSet.has(i.name.toLowerCase()));
  }
  if (delta.quest_updates?.length) {
    for (const q of delta.quest_updates) {
      const idx = next.quests.findIndex((x) => x.id === q.id);
      if (idx >= 0) next.quests[idx] = q;
      else next.quests.push(q);
    }
  }
  if (delta.codex_updates) {
    for (const [name, entry] of Object.entries(delta.codex_updates)) {
      next.codex[name] = { ...next.codex[name], ...entry };
    }
  }
  if (delta.world_updates) {
    const w = delta.world_updates;
    if (w.locations) Object.assign(next.world.locations, w.locations);
    if (w.factions) Object.assign(next.world.factions, w.factions);
    if (w.reputation) Object.assign(next.world.reputation, w.reputation);
    if (w.facts?.length) {
      for (const f of w.facts) if (!next.world.facts.includes(f)) next.world.facts.push(f);
    }
  }
  return next;
}
