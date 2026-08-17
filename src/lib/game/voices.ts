export type VoiceOption = {
  id: string;
  label: string;
  gender: string;
  description: string;
};

export const VOICES: VoiceOption[] = [
  { id: "Kore", label: "Kore", gender: "Feminine", description: "Clear, firm, and composed." },
  {
    id: "Puck",
    label: "Puck",
    gender: "Masculine",
    description: "Upbeat, nimble, and adventurous.",
  },
  {
    id: "Charon",
    label: "Charon",
    gender: "Masculine",
    description: "Measured, resonant, and atmospheric.",
  },
  { id: "Aoede", label: "Aoede", gender: "Feminine", description: "Breezy, lyrical, and warm." },
  {
    id: "Fenrir",
    label: "Fenrir",
    gender: "Masculine",
    description: "Energetic, expressive, and intense.",
  },
  { id: "Leda", label: "Leda", gender: "Feminine", description: "Youthful, bright, and intimate." },
  {
    id: "Orus",
    label: "Orus",
    gender: "Masculine",
    description: "Steady, direct, and authoritative.",
  },
  { id: "Zephyr", label: "Zephyr", gender: "Feminine", description: "Bright, gentle, and quick." },
];

const KEY = "itw.tts.voice";

export function getVoice(): string {
  if (typeof window === "undefined") return "Kore";
  return window.localStorage.getItem(KEY) || "Kore";
}

export function setVoice(voice: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, voice);
  window.dispatchEvent(new Event("itw-voice-change"));
}
