// Genre → accent theme mapping. Applied by setting CSS custom properties
// (--accent, --accent-glow, --ring) on a container element via inline style.
// Also exposes a lucide icon per genre for badges.
import {
  Cpu,
  Swords,
  Sparkles,
  Rocket,
  Ghost,
  Search,
  Skull,
  Landmark,
  Feather,
  Coffee,
  Home,
  Eye,
  Trophy,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export type GenreTheme = {
  /** short label */
  label: string;
  /** oklch color for the accent (drives borders, glow, highlights) */
  accent: string;
  /** rgba/oklch with alpha for glow shadows */
  glow: string;
  /** icon shown on genre badge */
  icon: LucideIcon;
};

const DEFAULT: GenreTheme = {
  label: "Adventure",
  accent: "oklch(0.78 0.14 70)",
  glow: "oklch(0.78 0.14 70 / 55%)",
  icon: BookOpen,
};

const MAP: Record<string, GenreTheme> = {
  Cyberpunk: {
    label: "Cyberpunk",
    accent: "oklch(0.78 0.19 200)",
    glow: "oklch(0.78 0.19 200 / 55%)",
    icon: Cpu,
  },
  "Dark Fantasy": {
    label: "Dark Fantasy",
    accent: "oklch(0.62 0.2 15)",
    glow: "oklch(0.62 0.2 15 / 55%)",
    icon: Swords,
  },
  "High Fantasy": {
    label: "High Fantasy",
    accent: "oklch(0.82 0.15 90)",
    glow: "oklch(0.82 0.15 90 / 55%)",
    icon: Sparkles,
  },
  "Space Opera": {
    label: "Space Opera",
    accent: "oklch(0.72 0.2 285)",
    glow: "oklch(0.72 0.2 285 / 55%)",
    icon: Rocket,
  },
  Horror: {
    label: "Horror",
    accent: "oklch(0.55 0.22 20)",
    glow: "oklch(0.55 0.22 20 / 55%)",
    icon: Ghost,
  },
  "Noir Mystery": {
    label: "Noir Mystery",
    accent: "oklch(0.7 0.05 240)",
    glow: "oklch(0.7 0.05 240 / 55%)",
    icon: Search,
  },
  "Post-Apocalyptic": {
    label: "Post-Apocalyptic",
    accent: "oklch(0.68 0.18 45)",
    glow: "oklch(0.68 0.18 45 / 55%)",
    icon: Skull,
  },
  Historical: {
    label: "Historical",
    accent: "oklch(0.78 0.14 130)",
    glow: "oklch(0.78 0.14 130 / 55%)",
    icon: Landmark,
  },
  Mythic: {
    label: "Mythic",
    accent: "oklch(0.82 0.14 90)",
    glow: "oklch(0.82 0.14 90 / 55%)",
    icon: Feather,
  },
  "Slice of Life": {
    label: "Slice of Life",
    accent: "oklch(0.78 0.1 60)",
    glow: "oklch(0.78 0.1 60 / 55%)",
    icon: Coffee,
  },
  Cozy: {
    label: "Cozy",
    accent: "oklch(0.8 0.12 55)",
    glow: "oklch(0.8 0.12 55 / 55%)",
    icon: Home,
  },
  Surreal: {
    label: "Surreal",
    accent: "oklch(0.72 0.2 320)",
    glow: "oklch(0.72 0.2 320 / 55%)",
    icon: Eye,
  },
  Sports: {
    label: "Sports",
    accent: "oklch(0.7 0.2 245)",
    glow: "oklch(0.7 0.2 245 / 55%)",
    icon: Trophy,
  },
};

export function getGenreTheme(genre: string | undefined | null): GenreTheme {
  if (!genre) return DEFAULT;
  return MAP[genre] ?? DEFAULT;
}

/** Inline CSS var overrides to scope a theme to a subtree. */
export function themeVars(genre: string | undefined | null): React.CSSProperties {
  const t = getGenreTheme(genre);
  return {
    // @ts-expect-error – custom CSS props
    "--accent": t.accent,
    "--accent-glow": t.glow,
    "--ring": t.accent,
    "--primary": t.accent,
    "--sidebar-primary": t.accent,
  };
}
