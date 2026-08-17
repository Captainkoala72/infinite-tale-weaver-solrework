import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import type { ChatMessage } from "./types";
import { enforceAiUsage } from "./usage.server";

function validateChat(data: { messages: ChatMessage[]; model: string }) {
  if (!Array.isArray(data.messages) || data.messages.length === 0 || data.messages.length > 50) {
    throw new Error("Invalid conversation length");
  }
  const total = data.messages.reduce((sum, message) => sum + message.content.length, 0);
  if (total > 120_000) throw new Error("Conversation is too long");
  if (!data.model || data.model.length > 80) throw new Error("Invalid model");
  return data;
}

function validatePrompt(data: { prompt: string; model?: string }) {
  const prompt = data.prompt?.trim();
  if (!prompt || prompt.length > 8_000) throw new Error("Prompt is empty or too long");
  if (data.model && data.model.length > 100) throw new Error("Invalid model");
  return { ...data, prompt };
}

export const aiChat = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator(validateChat)
  .handler(async ({ data, context }) => {
    await enforceAiUsage(context.adminDb, context.userId, "chat");
    const { callChatByModel } = await import("./ai.server");
    return { text: await callChatByModel(data.messages, data.model) };
  });

export const aiImage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator(validatePrompt)
  .handler(async ({ data, context }) => {
    await enforceAiUsage(context.adminDb, context.userId, "image");
    const { generateImageServer } = await import("./ai.server");
    return { dataUrl: await generateImageServer(data.prompt, data.model) };
  });

export const aiVideo = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator(validatePrompt)
  .handler(async ({ data, context }) => {
    await enforceAiUsage(context.adminDb, context.userId, "video");
    const { generateVideoServer } = await import("./ai.server");
    return { dataUrl: await generateVideoServer(data.prompt, data.model) };
  });

export const aiLiveVoiceToken = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    await enforceAiUsage(context.adminDb, context.userId, "tts");
    const { mintGeminiLiveToken } = await import("./ai.server");
    return { token: await mintGeminiLiveToken() };
  });

export const aiTts = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { text: string; voice: string; instructions: string }) => {
    if (!data.text?.trim() || data.text.length > 24_000)
      throw new Error("Narration is empty or too long");
    if (data.voice.length > 40 || data.instructions.length > 4_000)
      throw new Error("Invalid narration settings");
    return { ...data, text: data.text.trim() };
  })
  .handler(async ({ data, context }) => {
    await enforceAiUsage(context.adminDb, context.userId, "tts");
    const { ttsServer } = await import("./ai.server");
    const audio = await ttsServer(data.text, data.voice, data.instructions);
    return { audio_base64: audio.base64, mime_type: audio.mimeType };
  });

export const aiSummarize = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { text: string; model: string }) => {
    if (!data.text?.trim() || data.text.length > 40_000)
      throw new Error("Scene is empty or too long");
    return { ...data, text: data.text.trim() };
  })
  .handler(async ({ data, context }) => {
    await enforceAiUsage(context.adminDb, context.userId, "chat");
    const { callChatByModel } = await import("./ai.server");
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You compress narrative scenes into short spoken summaries. Return ONLY the summary prose — no preamble, no JSON, no headings. Preserve tone, key events, and stakes. Aim for 2–4 sentences.",
      },
      { role: "user", content: `Summarize this scene for narration:\n\n${data.text}` },
    ];
    // Summarizer never wants JSON mode; strip response_format for OpenAI/DeepSeek.
    const raw = await callChatByModel(messages, data.model, { plainText: true });
    return { summary: raw.trim() };
  });

export const aiQuickPrompt = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { context: string; model: string }) => {
    if (!data.context?.trim() || data.context.length > 24_000)
      throw new Error("Story context is empty or too long");
    return { ...data, context: data.context.trim() };
  })
  .handler(async ({ data, context }) => {
    await enforceAiUsage(context.adminDb, context.userId, "chat");
    const { callChatByModel } = await import("./ai.server");
    const SPARKS = [
      "introduce a brand-new character who was not previously present",
      "shift the location to somewhere unexpected but plausible",
      "leverage or reveal a hidden object/detail from the environment",
      "propose a risky social or emotional gambit rather than a physical action",
      "pursue an angle the offered choices deliberately avoid",
      "act on a sudden intuition, memory, or dream fragment",
      "attempt something clever, subversive, or morally grey",
      "engage a secondary sense (smell, sound, temperature) as the trigger",
    ];
    const spark = SPARKS[Math.floor(Math.random() * SPARKS.length)];
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are the Conjurium Promptis — an oracle that whispers a single, VIVID, unexpected next action for the player in an ongoing choose-your-own-adventure. Your answer MUST be a fresh direction, not a rephrasing of what has already happened or of the offered choices. Introduce at least one concrete NEW element: a specific object, person, place, tactic, or sensory detail that has not appeared in the recent narration or in the offered choices. Write it as a first-person imperative sentence (e.g. 'I slip behind the tapestry and press my ear against the cold stone…'). 20 to 45 words. Rich, specific, tonally matched to the genre. Return ONLY the action text — no quotes, no numbering, no preamble, no JSON, no meta commentary.",
      },
      {
        role: "user",
        content: `${data.context}\n\nCreative direction for THIS suggestion: ${spark}.\n\nProduce ONE action sentence (20–45 words) that clearly diverges from everything above.`,
      },
    ];
    const raw = await callChatByModel(messages, data.model, {
      plainText: true,
      temperature: 1.0,
      maxTokens: 400,
    });
    return { prompt: raw.trim().replace(/^["'\s]+|["'\s]+$/g, "") };
  });
