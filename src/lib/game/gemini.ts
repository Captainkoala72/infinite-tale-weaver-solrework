import { aiImage, aiVideo } from "./ai.functions";

export async function generateImage(prompt: string, model?: string): Promise<string> {
  const { dataUrl } = await aiImage({ data: { prompt, model } });
  return dataUrl;
}

export async function generateVideo(prompt: string, model?: string): Promise<string> {
  const { dataUrl } = await aiVideo({ data: { prompt, model } });
  return dataUrl;
}
