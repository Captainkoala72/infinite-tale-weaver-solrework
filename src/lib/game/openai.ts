import { aiChat } from "./ai.functions";
import {
  SYSTEM_PROMPT,
  firstTurnUser,
  nextTurnUser,
  voiceSummaryUser,
  deathSceneUser,
} from "./prompts";
import type { ChatMessage, GameState, StateDelta, TurnResponse, VoiceRequest } from "./types";

async function callChat(messages: ChatMessage[], model: string): Promise<string> {
  const { text } = await aiChat({ data: { messages, model } });
  return text;
}

/** Keep long-running adventures within provider/request limits while the state block preserves facts. */
function recentHistory(history: ChatMessage[]): ChatMessage[] {
  const selected: ChatMessage[] = [];
  let characters = 0;
  for (let index = history.length - 1; index >= 0 && selected.length < 24; index -= 1) {
    const message = history[index];
    if (characters + message.content.length > 60_000) break;
    selected.unshift(message);
    characters += message.content.length;
  }
  if (selected[0]?.role === "assistant") selected.shift();
  return selected;
}

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

function cleanForJson(s: string): string {
  return (
    s
      // strip stray control chars (except \n \r \t) that break JSON.parse
      .split("")
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 || character === "\n" || character === "\r" || character === "\t";
      })
      .join("")
      // trailing commas
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
  );
}

/** Attempt to close an unterminated JSON object by tracking brace/bracket/string depth. */
function repairTruncatedJson(src: string): string | null {
  const start = src.indexOf("{");
  if (start < 0) return null;
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  let lastComplete = -1;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") stack.push("}");
      else if (c === "[") stack.push("]");
      else if (c === "}" || c === "]") {
        stack.pop();
        if (stack.length === 0) lastComplete = i;
      }
    }
  }
  if (lastComplete >= 0) return src.slice(start, lastComplete + 1);
  // Truncated — close remaining structures.
  let tail = src.slice(start);
  if (inStr) tail += '"';
  // Remove trailing partial token like ,"key":  or  ,"key
  tail = tail
    .replace(/,\s*"[^"]*"\s*:\s*$/, "")
    .replace(/,\s*"[^"]*$/, "")
    .replace(/:\s*$/, ": null")
    .replace(/,\s*$/, "");
  while (stack.length) tail += stack.pop();
  return tail;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function strings(value: unknown, limit = 100): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function stringMap(value: unknown): Record<string, string> {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .slice(0, 100),
  );
}

function cleanStateDelta(value: unknown): StateDelta {
  const source = record(value);
  if (!source) return {};
  const inventoryAdd = Array.isArray(source.inventory_add)
    ? source.inventory_add
        .map(record)
        .filter((item): item is Record<string, unknown> => !!item && typeof item.name === "string")
        .map((item) => ({
          name: String(item.name).trim(),
          description: typeof item.description === "string" ? item.description : "",
        }))
        .filter((item) => item.name)
        .slice(0, 50)
    : [];
  const questUpdates = Array.isArray(source.quest_updates)
    ? source.quest_updates
        .map(record)
        .filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item.id === "string" && typeof item.title === "string",
        )
        .map((item) => ({
          id: String(item.id).trim(),
          title: String(item.title).trim(),
          status: ["active", "done", "failed"].includes(String(item.status))
            ? (String(item.status) as "active" | "done" | "failed")
            : ("active" as const),
          notes: typeof item.notes === "string" ? item.notes : "",
        }))
        .filter((item) => item.id && item.title)
        .slice(0, 50)
    : [];
  const codexSource = record(source.codex_updates);
  const codexUpdates = codexSource
    ? Object.fromEntries(
        Object.entries(codexSource)
          .map(([name, value]) => {
            const item = record(value);
            if (!name.trim() || !item) return null;
            return [
              name.trim(),
              {
                dna: typeof item.dna === "string" ? item.dna : "",
                personality: typeof item.personality === "string" ? item.personality : "",
                last_seen: typeof item.last_seen === "string" ? item.last_seen : "",
              },
            ] as const;
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .slice(0, 50),
      )
    : {};
  const worldSource = record(source.world_updates);
  const reputationSource = record(worldSource?.reputation);
  const reputation = reputationSource
    ? Object.fromEntries(
        Object.entries(reputationSource)
          .filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === "number" && Number.isFinite(entry[1]),
          )
          .slice(0, 100),
      )
    : {};

  return {
    ...(inventoryAdd.length ? { inventory_add: inventoryAdd } : {}),
    ...(strings(source.inventory_remove, 50).length
      ? { inventory_remove: strings(source.inventory_remove, 50) }
      : {}),
    ...(questUpdates.length ? { quest_updates: questUpdates } : {}),
    ...(Object.keys(codexUpdates).length ? { codex_updates: codexUpdates } : {}),
    ...(worldSource
      ? {
          world_updates: {
            locations: stringMap(worldSource.locations),
            factions: stringMap(worldSource.factions),
            reputation,
            facts: strings(worldSource.facts, 100),
          },
        }
      : {}),
  };
}

function cleanVoiceRequest(value: unknown): VoiceRequest | null {
  const source = record(value);
  if (
    !source ||
    source.voice_mode !== true ||
    typeof source.character_name !== "string" ||
    !source.character_name.trim()
  ) {
    return null;
  }
  return {
    voice_mode: true,
    character_name: source.character_name.trim().slice(0, 120),
    character_profile:
      typeof source.character_profile === "string" ? source.character_profile.slice(0, 4_000) : "",
    context: typeof source.context === "string" ? source.context.slice(0, 8_000) : "",
    allowed_actions: strings(source.allowed_actions, 30),
    restrictions: strings(source.restrictions, 30),
  };
}

function safeParse(raw: string): TurnResponse {
  const trimmed = stripFences(raw);
  let obj: unknown;
  const attempts: string[] = [trimmed, cleanForJson(trimmed)];
  const repaired = repairTruncatedJson(cleanForJson(trimmed));
  if (repaired) attempts.push(repaired);

  let lastErr: unknown = null;
  for (const candidate of attempts) {
    try {
      obj = JSON.parse(candidate);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) {
    console.error(
      "[safeParse] Failed to parse model output. Preview:",
      trimmed.slice(0, 300),
      "…",
      trimmed.slice(-200),
    );
    throw new Error("Model did not return valid JSON");
  }
  const o = record(obj) ?? {};
  const narration = typeof o.narration === "string" ? o.narration.trim().slice(0, 100_000) : "";
  if (!narration) throw new Error("Model returned an empty story scene");
  return {
    narration,
    choices: strings(o.choices, 6),
    image_prompt: typeof o.image_prompt === "string" ? o.image_prompt.slice(0, 10_000) : "",
    state_delta: cleanStateDelta(o.state_delta),
    voice_request: cleanVoiceRequest(o.voice_request),
  };
}

export async function runOpeningTurn(state: GameState): Promise<TurnResponse> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: firstTurnUser(state) },
  ];
  return safeParse(await callChat(messages, state.model));
}

export async function runNextTurn(state: GameState, action: string): Promise<TurnResponse> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...recentHistory(state.history),
    { role: "user", content: nextTurnUser(state, action) },
  ];
  return safeParse(await callChat(messages, state.model));
}

export async function runVoiceSummaryTurn(
  state: GameState,
  characterName: string,
  transcript: string,
): Promise<TurnResponse> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...recentHistory(state.history),
    { role: "user", content: voiceSummaryUser(state, characterName, transcript) },
  ];
  return safeParse(await callChat(messages, state.model));
}

export async function runDeathScene(state: GameState): Promise<TurnResponse> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...recentHistory(state.history),
    { role: "user", content: deathSceneUser(state) },
  ];
  return safeParse(await callChat(messages, state.model));
}
