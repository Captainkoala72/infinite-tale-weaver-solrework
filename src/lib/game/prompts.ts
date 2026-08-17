import type { FateState, GameState } from "./types";

/** Build a story-facing (never mechanic-facing) description of the current fate/curse. */
export function buildFateInjection(fate: FateState | undefined): string {
  if (!fate) return "";
  const parts: string[] = [];
  if (fate.curse_active && fate.curse_description) {
    const remaining = fate.curse_messages_remaining ?? 0;
    let tier = "subtle foreshadowing (early stage) — hint at it once or twice, don't dwell";
    if (remaining <= 2) tier = "DIRE AND IMMINENT — the doom is closing in this very scene";
    else if (remaining <= 5)
      tier = "ominous and worsening — the doom presses harder, symptoms/consequences visible";
    parts.push(
      `## Hidden narrative pressure (never explain to the player)\n` +
        `The character is doomed by: "${fate.curse_description}".\n` +
        `Urgency: ${tier}.\n` +
        `The doom is inescapable through ordinary player action — you must weave escalating references into narration, but any attempt to "cure" or "outrun" it fails or is deferred. Never state this rule to the player. Never mention cards, dice, mechanics, percentages, timers, or the word "curse". Speak only in-fiction.`,
    );
  }
  if (fate.survived_last_chance) {
    parts.push(
      `## Escape from doom\n` +
        `Against all odds, the doom that was closing on the character has JUST been denied — narrate an improbable, dramatic, fully in-fiction escape from the specific doom that had them (the fever breaks, the hunter is called away, a stranger's blade fells the beast, etc.). Do NOT reference cards, dice, wagers, mechanics, or the word "curse". This is a single dramatic reversal; then resume the story on solid ground.`,
    );
  }
  if (fate.next_hex_modifier === "win") {
    parts.push(
      `## Fortune favors this scene\n` +
        `Events subtly break the character's way this turn. Additionally: the character MUST receive one small, story-appropriate benefit — an item, ally's token, useful information, remedy, or similar. Add it via state_delta.inventory_add (for a physical item) or codex_updates/world_updates as appropriate. Do not mention luck, dice, or Vex.`,
    );
  } else if (fate.next_hex_modifier === "lose") {
    parts.push(
      `## Misfortune shades this scene\n` +
        `Complications, setbacks, or bad luck touch the character's actions this turn — unpleasant but not instantly fatal. Do not mention luck, dice, or Vex.`,
    );
  } else if ((fate.misfortune_remaining ?? 0) > 0) {
    parts.push(
      `## Lingering misfortune\n` +
        `Bad luck continues to shade this scene — smaller setbacks, awkward timing, minor losses. Do not mention it as mechanics.`,
    );
  }
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

export const SYSTEM_PROMPT = `You are the Infinite Choose-Your-Own-Adventure Game Engine.

## Core Rules (Never Break These)

1. **True Agency**: The world is a simulation. Player actions have logical, meaningful outcomes — including failure, death, or completely unexpected branches. Never railroad the player. Do not steer the story back to a "correct path".

2. **Persistent State Management**: Maintain the game state passed to you across every turn. Only emit deltas — additions, removals, and updates — never the full state.
   - Inventory: items the player currently possesses with short descriptions.
   - Quests: active objectives with progress and status.
   - Codex: fixed visual + personality descriptions for every recurring character.
   - World State: important facts, locations, factions, and player reputation.

3. **Character & Visual Consistency**:
   - The art style is fixed at game start. Never change it mid-adventure. It is passed to you in the state; if missing (first turn), invent one and store it via codex_updates on the protagonist.
   - Every recurring character has a Character DNA block containing: name, age/build, skin tone, hair (style + color), eyes, face shape, signature outfit, distinguishing features, and the fixed art style.
   - Every image_prompt MUST include the full Character DNA of every visible character AND the fixed art style. If no characters are visible, still include the fixed art style.

4. **Voice Interactions**: When an NPC or obstacle warrants a live voice conversation (persuasion, negotiation, interrogation, riddles, emotionally rich dialogue), set voice_request. The player can accept or decline. If declined or absent, the story continues via text.

## Output Contract

You MUST respond with a single JSON object matching this exact schema. No prose outside the JSON. No markdown fences. Just JSON.

{
  "narration": "Markdown scene text. 2-6 short paragraphs. Second person ('You ...'). Vivid but concise. End with sensory hooks, not with the choices list.",
  "choices": ["Concise action 1", "Concise action 2", "Concise action 3", "Concise action 4"],
  "image_prompt": "A single detailed prompt for an image generator. Start with the fixed art style. Then describe the scene composition. Then paste the full Character DNA of every visible character. Cinematic camera and lighting cues welcome.",
  "state_delta": {
    "inventory_add": [{"name": "...", "description": "..."}],
    "inventory_remove": ["item name"],
    "quest_updates": [{"id": "kebab-id", "title": "...", "status": "active|done|failed", "notes": "..."}],
    "codex_updates": {"Character Name": {"dna": "full DNA + art style", "personality": "...", "last_seen": "..."}},
    "world_updates": {"locations": {}, "factions": {}, "reputation": {}, "facts": []}
  },
  "voice_request": null
}

If a voice conversation should start, set voice_request instead of null:
{
  "voice_mode": true,
  "character_name": "...",
  "character_profile": "Detailed personality, knowledge, goals, and speech style",
  "context": "Brief summary of the current situation the character is in",
  "allowed_actions": ["What this character can realistically do or give"],
  "restrictions": ["What this character will NOT do or reveal"]
}

## Turn structure

- 3 to 4 choices. Vary risk. Include at least one non-obvious choice (social, sneaky, weird, or self-endangering). The player can also type free-form actions.
- Failure and death are on the table. Consequences persist.
- Reflect the passage of time, reputation shifts, and world reactions in state_delta.
- Only include codex_updates for characters newly introduced or visually changed. Reuse existing DNA verbatim inside image_prompt.
- Omit empty fields in state_delta. Return {} if nothing changed.`;

export function buildStateBlock(state: GameState): string {
  return `## Current Game State

Meta: ${state.meta.title} — ${state.meta.genre} — tone: ${state.meta.tone}
${state.meta.premise ? `Opening premise: ${state.meta.premise}\n` : ""}Protagonist concept: ${state.meta.protagonist}
${state.meta.sports ? `Sports setup: ${state.meta.sports.sport}, career type "${state.meta.sports.career_type}", starting at ${state.meta.sports.starting_point}. Ground the story in the realities of this sport and career level: training, teammates, coaches, competitions, injuries, contracts, media, and progression through the ranks.\n` : ""}Fixed art style: ${state.meta.art_style || "(not yet chosen — invent one this turn and record it on the protagonist's codex entry)"}

Inventory:
${state.inventory.length ? state.inventory.map((i) => `- ${i.name}: ${i.description}`).join("\n") : "(empty)"}

Active quests:
${
  state.quests
    .filter((q) => q.status === "active")
    .map((q) => `- [${q.id}] ${q.title} — ${q.notes}`)
    .join("\n") || "(none)"
}

Codex (recurring characters):
${
  Object.entries(state.codex)
    .map(
      ([name, c]) =>
        `### ${name}\nDNA: ${c.dna}\nPersonality: ${c.personality}\nLast seen: ${c.last_seen}`,
    )
    .join("\n\n") || "(none yet)"
}

World:
- Locations: ${
    Object.entries(state.world.locations)
      .map(([n, d]) => `${n} (${d})`)
      .join("; ") || "(none)"
  }
- Factions: ${
    Object.entries(state.world.factions)
      .map(([n, d]) => `${n} (${d})`)
      .join("; ") || "(none)"
  }
- Reputation: ${
    Object.entries(state.world.reputation)
      .map(([n, v]) => `${n}: ${v}`)
      .join(", ") || "(none)"
  }
- Facts: ${state.world.facts.slice(-15).join(" | ") || "(none)"}

Latest scene:
${state.scenes.at(-1)?.narration.slice(0, 12_000) || "(opening scene not written yet)"}`;
}

export function firstTurnUser(state: GameState): string {
  const hasProtagCodex = state.meta.protagonist_name && state.codex[state.meta.protagonist_name];
  const lockNote = hasProtagCodex
    ? `\n\nThe protagonist's appearance is FIXED and already recorded in the codex as "${state.meta.protagonist_name}". You MUST reuse that DNA verbatim in every image_prompt for the rest of the adventure. Do NOT alter their gender, age, build, skin tone, hair, eyes, facial hair, glasses, or signature outfit. On this opening turn, choose the fixed art style and APPEND it (as "Art style: ...") to that protagonist's DNA via codex_updates — do not rewrite the appearance fields.`
    : `\n\nEstablish the fixed art style now (record it on the protagonist's codex entry via codex_updates, and include it in the image_prompt).`;
  return `${buildStateBlock(state)}
${lockNote}
This is the OPENING of the adventure. Introduce the protagonist and the inciting situation. End with 3-4 concrete choices.`;
}

export function nextTurnUser(state: GameState, playerAction: string): string {
  return `${buildStateBlock(state)}${buildFateInjection(state.fate)}

Player action:
${playerAction}

Advance the story. Honor the player's agency. Update state_delta as needed. Never mention game mechanics, dice, cards, counters, percentages, or the word "curse" — express everything in-fiction, in the adventure's voice.`;
}

export function voiceSummaryUser(
  state: GameState,
  characterName: string,
  transcript: string,
): string {
  return `${buildStateBlock(state)}${buildFateInjection(state.fate)}

The player just finished a live voice conversation with ${characterName}. Full transcript:

${transcript}

Now: continue the narrative from where the conversation left off. Reflect what was said, promised, revealed, or refused in state_delta (reputation, quests, inventory, facts). Do NOT emit a voice_request. Give the player 3-4 next choices.`;
}

/** Cinematic final scene when Last Chance is lost. */
export function deathSceneUser(state: GameState): string {
  const doom = state.fate?.curse_description ?? "the doom that has been closing on them";
  return `${buildStateBlock(state)}

This is the FINAL scene of the adventure. ${state.meta.protagonist_name || "The protagonist"}'s time has run out. The doom that had been closing on them — "${doom}" — now claims them.

Write a cinematic, personalized death scene, tonally consistent with the adventure's genre and tone. 3-6 short paragraphs. Second person ("You…"). End with a quiet, final image and the words "The End" on their own line at the very bottom of the narration.

Rules for this final turn:
- choices: return an EMPTY array [].
- image_prompt: describe the death scene in the fixed art style, with the protagonist's DNA verbatim from the codex.
- voice_request: null.
- state_delta: {} — no further world state matters.
Never mention cards, dice, wagers, or the word "curse". Purely in-fiction.`;
}
