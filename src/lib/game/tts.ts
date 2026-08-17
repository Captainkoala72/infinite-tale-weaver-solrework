import { aiTts, aiSummarize } from "./ai.functions";
import type { GameState } from "./types";
import { getVoice } from "./voices";

export function buildTtsInstructions(state: GameState): string {
  const genre = state.meta.genre || "adventure";
  const tone = state.meta.tone || "cinematic";
  const style = state.meta.art_style ? ` The world's art style is: ${state.meta.art_style}.` : "";
  return [
    `You are the narrator of a ${genre} choose-your-own-adventure story.`,
    `Adopt a ${tone} tone: match its pacing, mood, and emotional register.${style}`,
    `Speak like an immersive audiobook narrator. Use natural pauses, dynamic emphasis, and vivid delivery that fits the ${tone} ${genre} atmosphere.`,
    `Do not add commentary, disclaimers, or announce yourself — read the passage as prose.`,
  ].join(" ");
}

async function playBase64Audio(b64: string, mimeType: string): Promise<void> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  try {
    await new Promise<void>((resolve, reject) => {
      audio.addEventListener("ended", () => resolve(), { once: true });
      audio.addEventListener("error", () => reject(new Error("Narration playback failed.")), {
        once: true,
      });
      audio.play().catch(reject);
    });
  } finally {
    audio.pause();
    URL.revokeObjectURL(url);
  }
}

export async function speakText(text: string, state: GameState): Promise<void> {
  const voice = state.meta.narrator_voice || getVoice();
  const { audio_base64, mime_type } = await aiTts({
    data: { text, voice, instructions: buildTtsInstructions(state) },
  });
  await playBase64Audio(audio_base64, mime_type);
}

export async function speakSummary(text: string, state: GameState): Promise<void> {
  const { summary } = await aiSummarize({ data: { text, model: state.model } });
  await speakText(summary, state);
}
