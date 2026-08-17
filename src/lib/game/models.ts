export type ModelOption = { id: string; label: string };

export const TEXT_MODELS: ModelOption[] = [
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (recommended)" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (economy)" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (deep reasoning, preview)" },
];

export type ImageModelOption = {
  id: string;
  label: string;
  provider: "gemini" | "pixazo" | "xai";
  endpoint?: string;
};

export const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";

export const IMAGE_MODELS: ImageModelOption[] = [
  { id: "gemini-3.1-flash-image", label: "Nano Banana 2 (recommended)", provider: "gemini" },
  { id: "gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite (economy)", provider: "gemini" },
  { id: "gemini-3-pro-image", label: "Nano Banana Pro (premium)", provider: "gemini" },
];

export type VideoModelOption = {
  id: string;
  label: string;
  provider: "gemini" | "pixazo";
  endpoint?: string;
};

export const DEFAULT_VIDEO_MODEL = "gemini-omni-flash-preview";

export const VIDEO_MODELS: VideoModelOption[] = [
  {
    id: "gemini-omni-flash-preview",
    label: "Gemini Omni Flash (recommended, preview)",
    provider: "gemini",
  },
];
