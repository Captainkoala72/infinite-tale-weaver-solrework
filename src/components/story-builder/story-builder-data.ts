import type { Appearance } from "@/lib/game/types";
import { DEFAULT_FONT_ID } from "@/lib/game/fonts";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, TEXT_MODELS } from "@/lib/game/models";

export const STORY_DRAFT_KEY = "infinite-tale-weaver.story-builder.v2";

export const GENRES = [
  { value: "Dark Fantasy", description: "Cursed kingdoms and costly magic" },
  { value: "High Fantasy", description: "Epic quests in a wondrous realm" },
  { value: "Cyberpunk", description: "Neon cities and dangerous technology" },
  { value: "Space Opera", description: "A sweeping adventure among the stars" },
  { value: "Horror", description: "Dread, survival, and the unknown" },
  { value: "Noir Mystery", description: "Secrets in a city of long shadows" },
  { value: "Cozy", description: "Small stakes, warm places, real connection" },
  { value: "Sports", description: "Competition, ambition, and a career arc" },
] as const;

export const TONES = [
  "Cinematic",
  "Hopeful",
  "Gritty",
  "Playful",
  "Romantic",
  "Melancholic",
] as const;

export const ART_STYLES = [
  { value: "Cinematic realism", description: "Dramatic light and grounded detail" },
  { value: "Painterly storybook", description: "Expressive brushwork and rich color" },
  { value: "Graphic novel", description: "Bold inks and energetic composition" },
  { value: "Anime", description: "Stylized characters and vivid action" },
  { value: "Vintage illustration", description: "Aged print with classic charm" },
  { value: "Noir photography", description: "Monochrome, grain, and hard shadows" },
] as const;

export const SPORTS = [
  "Basketball",
  "Football (American)",
  "Soccer",
  "Baseball",
  "Hockey",
  "Tennis",
  "Boxing",
  "MMA",
  "Motorsport",
  "Esports",
] as const;

export const CAREER_TYPES = [
  "Player",
  "Coach",
  "Manager / GM",
  "Agent",
  "Sports journalist",
  "Team owner",
] as const;

export const STARTING_POINTS = [
  "Youth / rec league",
  "High school",
  "College",
  "Rookie pro",
  "Established pro",
  "Veteran comeback",
] as const;

export const APPEARANCE_OPTIONS = {
  gender: ["Woman", "Man", "Non-binary", "Ambiguous"],
  age: ["Teen", "Young adult", "Adult", "Middle-aged", "Elder"],
  height: ["Short", "Average", "Tall"],
  build: ["Slim", "Athletic", "Average", "Heavyset", "Muscular"],
  skin: ["Pale", "Fair", "Olive", "Tan", "Brown", "Dark"],
  hair_style: ["Short", "Buzzed", "Medium", "Long", "Curly", "Braided", "Ponytail", "Bald"],
  hair_color: ["Black", "Brown", "Blonde", "Red", "Auburn", "Gray", "White", "Dyed vivid"],
  eyes: ["Brown", "Hazel", "Green", "Blue", "Gray", "Amber", "Heterochromia"],
  glasses: ["none", "regular", "round wire", "sunglasses", "reading glasses"],
  facial_hair: ["none", "stubble", "mustache", "goatee", "short beard", "full beard"],
} satisfies Partial<Record<keyof Appearance, string[]>>;

export const APPEARANCE_PRESETS: Array<{
  label: string;
  description: string;
  appearance: Partial<Appearance>;
}> = [
  {
    label: "Grounded",
    description: "Natural, practical, and lived-in",
    appearance: {
      build: "Average",
      hair_style: "Medium",
      outfit: "weathered, practical traveling clothes",
    },
  },
  {
    label: "Heroic",
    description: "Bold silhouette and capable presence",
    appearance: {
      build: "Athletic",
      height: "Tall",
      outfit: "distinctive fitted gear suited to the world",
    },
  },
  {
    label: "Mysterious",
    description: "Striking details with secrets implied",
    appearance: {
      eyes: "Gray",
      hair_color: "Black",
      outfit: "layered dark clothing with a concealed keepsake",
    },
  },
];

export type StoryBuilderDraft = {
  title: string;
  premise: string;
  genre: string;
  customGenre: string;
  tone: string;
  customTone: string;
  artStyle: string;
  customArtStyle: string;
  protagonistName: string;
  background: string;
  personality: string;
  goal: string;
  flaw: string;
  appearance: Appearance;
  sport: string;
  careerType: string;
  startingPoint: string;
  model: string;
  narratorVoice: string;
  narratorFont: string;
  imageEnabled: boolean;
  imageModel: string;
  videoEnabled: boolean;
  videoModel: string;
  deathEnabled: boolean;
  hexesEnabled: boolean;
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

const DEFAULT_TEXT_MODEL =
  TEXT_MODELS.find((model) => model.id.toLowerCase().includes("gemini"))?.id ??
  TEXT_MODELS[0]?.id ??
  "gemini-3.6-flash";

export function createEmptyDraft(): StoryBuilderDraft {
  return {
    title: "",
    premise: "",
    genre: "Dark Fantasy",
    customGenre: "",
    tone: "Cinematic",
    customTone: "",
    artStyle: "Cinematic realism",
    customArtStyle: "",
    protagonistName: "",
    background: "",
    personality: "",
    goal: "",
    flaw: "",
    appearance: { ...EMPTY_APPEARANCE },
    sport: "Basketball",
    careerType: "Player",
    startingPoint: "High school",
    model: DEFAULT_TEXT_MODEL,
    narratorVoice: "Kore",
    narratorFont: DEFAULT_FONT_ID,
    imageEnabled: true,
    imageModel: DEFAULT_IMAGE_MODEL,
    videoEnabled: false,
    videoModel: DEFAULT_VIDEO_MODEL,
    deathEnabled: false,
    hexesEnabled: false,
  };
}

export function resolvedGenre(draft: StoryBuilderDraft): string {
  return draft.genre === "Custom" ? draft.customGenre.trim() : draft.genre;
}

export function resolvedTone(draft: StoryBuilderDraft): string {
  return draft.tone === "Custom" ? draft.customTone.trim() : draft.tone;
}

export function resolvedArtStyle(draft: StoryBuilderDraft): string {
  return draft.artStyle === "Custom" ? draft.customArtStyle.trim() : draft.artStyle;
}

export const SURPRISE_CONCEPTS: Array<Partial<StoryBuilderDraft>> = [
  {
    title: "The Lighthouse Below",
    premise:
      "At low tide, a lighthouse rises from beneath the harbor and begins signaling your name.",
    genre: "Dark Fantasy",
    tone: "Melancholic",
    artStyle: "Painterly storybook",
    protagonistName: "Mara Venn",
    background: "A disgraced cartographer who charts places that should not exist.",
    personality: "Observant, dry-witted, and slow to trust.",
    goal: "Learn why the drowned lighthouse remembers her.",
    flaw: "She would rather face danger alone than admit she needs help.",
  },
  {
    title: "Neon Ghost Protocol",
    premise:
      "A courier receives a package sent by their future self, with six hours to prevent a citywide memory wipe.",
    genre: "Cyberpunk",
    tone: "Gritty",
    artStyle: "Graphic novel",
    protagonistName: "Juno Vale",
    background:
      "A street courier with illegal neural augments and a talent for vanishing into crowds.",
    personality: "Quick-thinking, irreverent, and fiercely loyal.",
    goal: "Deliver the package and discover who erased their past.",
    flaw: "They turn every sincere moment into a joke.",
  },
  {
    title: "The Last Garden on Mars",
    premise:
      "When the colony's final living garden starts whispering coordinates, its caretaker steals a rover to follow them.",
    genre: "Space Opera",
    tone: "Hopeful",
    artStyle: "Cinematic realism",
    protagonistName: "Elias Chen",
    background: "A patient botanist raised beneath Mars's rust-colored sky.",
    personality: "Gentle, persistent, and quietly rebellious.",
    goal: "Find the source of the signal before the garden dies.",
    flaw: "He sees potential in everyone, including people who mean him harm.",
  },
  {
    title: "Second String Summer",
    premise:
      "A talented bench player gets one season to save a failing hometown team and repair a family rivalry.",
    genre: "Sports",
    tone: "Hopeful",
    artStyle: "Vintage illustration",
    protagonistName: "Alex Rivera",
    background: "An overlooked point guard returning home after a disastrous year away.",
    personality: "Competitive, generous, and stubborn under pressure.",
    goal: "Earn a starting place and bring the team to the championship.",
    flaw: "They mistake asking for help for giving up control.",
  },
];
