export type FontOption = {
  id: string;
  label: string;
  family: string; // full CSS font-family value with fallbacks
  description: string;
};

export const FONTS: FontOption[] = [
  {
    id: "story-script",
    label: "Story Script",
    family: '"Story Script", cursive',
    description: "Handwritten, whimsical script — feels like a personal journal entry.",
  },
  {
    id: "literata",
    label: "Literata",
    family: '"Literata", Georgia, serif',
    description: "Modern literary serif built for long-form reading. Warm and bookish.",
  },
  {
    id: "patrick-hand",
    label: "Patrick Hand",
    family: '"Patrick Hand", cursive',
    description: "Friendly handwritten print. Casual, notebook-scrawl vibe.",
  },
  {
    id: "playwrite-usa",
    label: "Playwrite USA Traditional",
    family: '"Playwrite US Trad", cursive',
    description: "Classic American cursive — schoolroom penmanship elegance.",
  },
  {
    id: "bangers",
    label: "Bangers",
    family: '"Bangers", cursive',
    description: "Bold comic-book display face. Loud, energetic, action-packed.",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    family: '"JetBrains Mono", ui-monospace, monospace',
    description: "Crisp developer monospace. Terminal, dossier, cyberpunk feel.",
  },
  {
    id: "bricolage-grotesque",
    label: "Bricolage Grotesque",
    family: '"Bricolage Grotesque", sans-serif',
    description:
      "A variable sans-serif with playful proportions; readable, expressive, and modern.",
  },
  {
    id: "share-tech",
    label: "Share Tech",
    family: '"Share Tech", sans-serif',
    description: "A utilitarian, tech-forward sans-serif; clean, precise, and futuristic.",
  },
];

export const DEFAULT_FONT_ID = "literata";

export function getFont(id?: string): FontOption {
  return FONTS.find((f) => f.id === id) ?? FONTS.find((f) => f.id === DEFAULT_FONT_ID)!;
}
