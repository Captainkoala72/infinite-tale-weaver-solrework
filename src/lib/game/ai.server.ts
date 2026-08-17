// Server-only provider helpers. Keys come from process.env; nothing here ships to client.
import type { ChatMessage } from "./types";

export type Provider = "gemini" | "openai" | "anthropic" | "deepseek";

const ALLOWED_TEXT_MODELS = new Set([
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5",
  "gpt-5-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-fable-5",
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-haiku-4-5",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
]);

export function providerForModel(model: string): Provider {
  if (model.startsWith("gemini-")) return "gemini";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("deepseek-")) return "deepseek";
  return "openai";
}

const DEEPSEEK_MAP: Record<string, string> = {
  "deepseek-v4-flash": "deepseek-chat",
  "deepseek-v4-pro": "deepseek-reasoner",
};

export type ChatOpts = { plainText?: boolean; temperature?: number; maxTokens?: number };

export async function callGemini(
  messages: ChatMessage[],
  model: string,
  opts?: ChatOpts,
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Server missing GEMINI_API_KEY");
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts?.maxTokens ?? 16_384,
    thinkingConfig: { thinkingLevel: "low" },
  };
  if (!opts?.plainText) generationConfig.responseMimeType = "application/json";
  if (
    typeof opts?.temperature === "number" &&
    model !== "gemini-3.6-flash" &&
    model !== "gemini-3.5-flash-lite"
  ) {
    generationConfig.temperature = opts.temperature;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${responseText.slice(0, 300)}`);
  }
  const payload = JSON.parse(responseText) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no text content");
  return text;
}

export async function callOpenAI(
  messages: ChatMessage[],
  model: string,
  opts?: ChatOpts,
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Server missing OPENAI_API_KEY");
  const body: Record<string, unknown> = { model, messages };
  if (!opts?.plainText) body.response_format = { type: "json_object" };
  if (typeof opts?.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts?.maxTokens === "number") {
    // Newer OpenAI models (gpt-5.x, o-series) require max_completion_tokens
    const key2 = /^(gpt-5|o\d|gpt-4\.1|gpt-4o-mini-tts)/i.test(model)
      ? "max_completion_tokens"
      : "max_tokens";
    body[key2] = opts.maxTokens;
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenAI returned no content");
  return content;
}

export async function callAnthropic(
  messages: ChatMessage[],
  model: string,
  opts?: ChatOpts,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Server missing ANTHROPIC_API_KEY");
  const systemParts: string[] = [];
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else turns.push({ role: m.role, content: m.content });
  }
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts?.maxTokens ?? 32000,
    system: systemParts.join("\n\n"),
    messages: turns,
  };
  if (typeof opts?.temperature === "number") body.temperature = opts.temperature;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const parts = json?.content;
  if (!Array.isArray(parts)) throw new Error("Anthropic returned no content");
  const text = parts
    .filter((p: { type?: string }) => p?.type === "text")
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text) throw new Error("Anthropic returned no text content");
  if (json?.stop_reason === "max_tokens")
    console.warn("[Anthropic] response hit max_tokens; parser will attempt repair.");
  return text;
}

export async function callDeepseek(
  messages: ChatMessage[],
  model: string,
  opts?: ChatOpts,
): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("Server missing DEEPSEEK_API_KEY");
  const apiModel = DEEPSEEK_MAP[model] ?? model;
  const body: Record<string, unknown> = {
    model: apiModel,
    messages,
    max_tokens: opts?.maxTokens ?? 8192,
  };
  if (!opts?.plainText) body.response_format = { type: "json_object" };
  if (typeof opts?.temperature === "number") body.temperature = opts.temperature;
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new Error("DeepSeek returned no content");
  if (json.choices?.[0]?.finish_reason === "length") {
    console.warn("[DeepSeek] response hit max_tokens; parser will attempt repair.");
  }
  return content;
}

export async function callChatByModel(
  messages: ChatMessage[],
  model: string,
  opts?: ChatOpts,
): Promise<string> {
  if (!ALLOWED_TEXT_MODELS.has(model)) throw new Error("Unsupported AI model");
  const provider = providerForModel(model);
  if (provider === "gemini") return callGemini(messages, model, opts);
  if (provider === "anthropic") return callAnthropic(messages, model, opts);
  if (provider === "deepseek") return callDeepseek(messages, model, opts);
  return callOpenAI(messages, model, opts);
}

const GEMINI_VOICES = new Set([
  "Kore",
  "Puck",
  "Charon",
  "Aoede",
  "Fenrir",
  "Leda",
  "Orus",
  "Zephyr",
]);

function wrapPcmAsWav(pcmBase64: string): string {
  const pcm = Buffer.from(pcmBase64, "base64");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]).toString("base64");
}

export async function ttsServer(
  text: string,
  voice: string,
  instructions: string,
): Promise<{ base64: string; mimeType: string }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const voiceName = GEMINI_VOICES.has(voice) ? voice : "Kore";
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${instructions}\n\nRead this passage exactly as written:\n${text}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini TTS ${response.status}: ${responseText.slice(0, 300)}`);
    }
    const payload = JSON.parse(responseText) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
      }>;
    };
    const audio = payload.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data,
    )?.inlineData;
    if (!audio?.data) throw new Error("Gemini TTS returned no audio");
    const mime = audio.mimeType ?? "audio/L16;codec=pcm;rate=24000";
    if (mime.toLowerCase().includes("l16") || mime.toLowerCase().includes("pcm")) {
      return { base64: wrapPcmAsWav(audio.data), mimeType: "audio/wav" };
    }
    return { base64: audio.data, mimeType: mime };
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) throw new Error("Server missing GEMINI_API_KEY or OPENAI_API_KEY");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts-2025-12-15",
      voice: "alloy",
      input: text,
      instructions,
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI TTS ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return {
    base64: Buffer.from(await response.arrayBuffer()).toString("base64"),
    mimeType: "audio/mpeg",
  };
}

const FALLBACK_ORDER = [
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image",
  "grok-imagine-image",
  "grok-imagine-image-quality",
  "seedream-5-0-lite",
  "z-image-turbo",
  "krea-2-turbo",
  "mai-image-2-5",
  "z-image-base",
  "wan-2-7-pro",
  "nucleus-image",
];

async function tryImageModel(prompt: string, id: string): Promise<string> {
  if (id.startsWith("gemini-") || id === "nano-banana-2-lite") {
    return generateGeminiImage(
      prompt,
      id === "nano-banana-2-lite" ? "gemini-3.1-flash-lite-image" : id,
    );
  }
  if (id === "grok-imagine-image" || id === "grok-imagine-image-quality")
    return generateXaiImage(prompt, id);
  return generatePixazoImage(prompt, id);
}

export async function generateImageServer(prompt: string, model?: string): Promise<string> {
  const selected = model || "gemini-3.1-flash-image";
  const chain = [selected, ...FALLBACK_ORDER.filter((id) => id !== selected)];
  for (const id of chain) {
    try {
      return await tryImageModel(prompt, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[image:${id}] failed, trying next model: ${msg.slice(0, 200)}`);
    }
  }
  throw new Error("Every configured image model failed");
}

async function generateGeminiImage(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Server missing GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  async function attempt(modalities: string[]) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: modalities,
          imageConfig: { aspectRatio: "16:9" },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
  let json = await attempt(["TEXT", "IMAGE"]);
  const extract = (j: unknown): string | null => {
    const c = (
      j as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> }
    )?.candidates?.[0];
    for (const p of c?.content?.parts ?? []) {
      const inline = (p.inlineData ?? p.inline_data) as
        { data?: string; mimeType?: string; mime_type?: string } | undefined;
      if (inline?.data)
        return `data:${inline.mimeType ?? inline.mime_type ?? "image/png"};base64,${inline.data}`;
    }
    return null;
  };
  let out = extract(json);
  if (out) return out;
  let cand = json?.candidates?.[0];
  if (cand?.finishReason === "PROHIBITED_CONTENT" || json?.promptFeedback?.blockReason) {
    const softened = `A tasteful, non-graphic, PG-rated illustration. Avoid any sensitive, violent, or explicit content. Scene: ${prompt}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: softened }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: "16:9" },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) {
      json = await res.json();
      out = extract(json);
      if (out) return out;
      cand = json?.candidates?.[0];
    }
  } else if (cand?.finishReason && cand.finishReason !== "STOP") {
    json = await attempt(["TEXT", "IMAGE"]);
    out = extract(json);
    if (out) return out;
    cand = json?.candidates?.[0];
  }
  const finish = cand?.finishReason ?? "unknown";
  throw new Error(`Gemini returned no image (finish=${finish})`);
}

const PIXAZO_ENDPOINTS: Record<string, string> = {
  "seedream-5-0-lite":
    "https://gateway.pixazo.ai/seedream-5-0-lite-text-to-image/v1/seedream-5-0-lite-text-to-image-request",
  "krea-2-turbo": "https://gateway.pixazo.ai/krea-2-turbo/v1/krea-2-turbo-request",
  "mai-image-2-5":
    "https://gateway.pixazo.ai/microsoft-mai-image-2-5/v1/microsoft-mai-image-2-5-request",
  "z-image-turbo": "https://gateway.pixazo.ai/z-image-turbo-834/v1/z-image-turbo-request",
  "z-image-base": "https://gateway.pixazo.ai/z-image-base/v1/z-image-base-request",
  "wan-2-7-pro": "https://gateway.pixazo.ai/wan-2-7-pro-api/v1/generateWan27ProTextToImageRequest",
  "nucleus-image": "https://gateway.pixazo.ai/nucleus-image/v1/nucleus-image-request",
};

function softenPrompt(p: string): string {
  return `A tasteful, PG-rated, non-graphic illustration. Avoid any sensitive, violent, sexual, or explicit content, and avoid named real people. Scene: ${p}`;
}

function isContentFlag(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("content checker") ||
    t.includes("flagged") ||
    t.includes("moderation") ||
    t.includes("prohibited")
  );
}

async function generateXaiImage(prompt: string, modelId: string): Promise<string> {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("Server missing XAI_API_KEY");
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: modelId,
      prompt: prompt.slice(0, 4900),
      n: 1,
      response_format: "b64_json",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`xAI image ${res.status}: ${text.slice(0, 300)}`);
  let json: { data?: Array<{ b64_json?: string; url?: string }> };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("xAI image returned non-JSON");
  }
  const entry = json.data?.[0];
  if (entry?.b64_json) return `data:image/png;base64,${entry.b64_json}`;
  if (entry?.url) return await fetchAsDataUrl(entry.url);
  throw new Error("xAI image returned no data");
}

async function generatePixazoImage(prompt: string, modelId: string): Promise<string> {
  const key = process.env.PIXAZO_API_KEY;
  if (!key) throw new Error("Server missing PIXAZO_API_KEY");
  const endpoint = PIXAZO_ENDPOINTS[modelId];
  if (!endpoint) throw new Error(`Unknown Pixazo model: ${modelId}`);
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Ocp-Apim-Subscription-Key": key,
  };

  async function attempt(p: string): Promise<string> {
    const body: Record<string, unknown> = {
      prompt: p.slice(0, 4900),
      num_images: 1,
      output_format: "png",
      sync_mode: false,
    };
    if (modelId === "krea-2-turbo") body.image_size = "square_hd";
    else body.aspect_ratio = "1:1";
    const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 422 || isContentFlag(text))
        throw new Error(`Pixazo content-flagged: ${text.slice(0, 200)}`);
      throw new Error(`Pixazo ${res.status}: ${text.slice(0, 300)}`);
    }
    let json: { request_id?: string; polling_url?: string; output?: { media_url?: string[] } };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Pixazo returned non-JSON");
    }
    const direct = json.output?.media_url?.[0];
    if (direct) return await fetchAsDataUrl(direct);
    const polling =
      json.polling_url ??
      (json.request_id ? `https://gateway.pixazo.ai/v2/requests/status/${json.request_id}` : null);
    if (!polling) throw new Error("Pixazo response missing polling_url");
    const started = Date.now();
    const TIMEOUT_MS = 90_000;
    while (Date.now() - started < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 1500));
      const pr = await fetch(polling, { headers: { "Ocp-Apim-Subscription-Key": key! } });
      const ptext = await pr.text();
      if (!pr.ok) {
        if (pr.status === 422 || isContentFlag(ptext))
          throw new Error(`Pixazo content-flagged: ${ptext.slice(0, 200)}`);
        continue;
      }
      let pj: { status?: string; error?: string | null; output?: { media_url?: string[] } };
      try {
        pj = JSON.parse(ptext);
      } catch {
        continue;
      }
      if (pj.status === "COMPLETED") {
        const url = pj.output?.media_url?.[0];
        if (!url) throw new Error("Pixazo completed without media_url");
        return await fetchAsDataUrl(url);
      }
      if (pj.status === "FAILED" || pj.status === "ERROR") {
        const errStr = pj.error ?? "unknown";
        if (isContentFlag(errStr)) throw new Error(`Pixazo content-flagged: ${errStr}`);
        throw new Error(`Pixazo failed: ${errStr}`);
      }
    }
    throw new Error("Pixazo timed out");
  }

  try {
    return await attempt(prompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("content-flagged")) {
      console.warn(`[image:${modelId}] content-flagged; retrying with softened prompt`);
      return await attempt(softenPrompt(prompt));
    }
    throw err;
  }
}

async function fetchAsDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const mime = res.headers.get("content-type") ?? "image/png";
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

const VIDEO_ENDPOINTS: Record<string, string> = {
  "seedance-2-0-mini": "https://gateway.pixazo.ai/seedance-2-0-mini/text-to-video",
  "pixverse-v6":
    "https://gateway.pixazo.ai/pixverse-v6-text-to-video/v1/pixverse-v6-text-to-video-request",
  "heygen-3-0":
    "https://gateway.pixazo.ai/pixverse-v6-text-to-video/v1/pixverse-v6-text-to-video-request",
};

const VIDEO_FALLBACK_ORDER = ["seedance-2-0-mini", "pixverse-v6", "heygen-3-0"];

async function summarizeVideoPrompt(prompt: string): Promise<string> {
  if (prompt.length <= 1000) return prompt;
  try {
    const summary = await callGemini(
      [
        {
          role: "system",
          content:
            "You compress text-to-video prompts. Rewrite the user's scene description as a single vivid cinematic prompt under 1000 characters. Preserve subject, appearance, action, setting, mood, lighting, and camera; drop redundancies. Output ONLY the rewritten prompt, no preface, no quotes.",
        },
        { role: "user", content: prompt },
      ],
      "gemini-3.5-flash-lite",
      { plainText: true, maxTokens: 800 },
    );
    const trimmed = summary.trim().slice(0, 1000);
    return trimmed || prompt.slice(0, 1000);
  } catch (err) {
    console.warn(
      "[video] prompt summarization failed, truncating:",
      err instanceof Error ? err.message : String(err),
    );
    return prompt.slice(0, 1000);
  }
}

export async function generateVideoServer(prompt: string, model?: string): Promise<string> {
  const selected = model || "gemini-omni-flash-preview";
  const chain = [selected, "gemini-omni-flash-preview", ...VIDEO_FALLBACK_ORDER].filter(
    (id, index, values) => values.indexOf(id) === index,
  );
  const compact = await summarizeVideoPrompt(prompt);
  for (const id of chain) {
    try {
      return id === "gemini-omni-flash-preview"
        ? await generateGeminiOmniVideo(compact)
        : await generatePixazoVideo(compact, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[video:${id}] failed, trying next model: ${msg.slice(0, 200)}`);
    }
  }
  throw new Error("All video models failed");
}

async function generateGeminiOmniVideo(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Server missing GEMINI_API_KEY");
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      model: "gemini-omni-flash-preview",
      input: `${prompt}\n\nSingle continuous cinematic shot. No dialogue.`,
      response_format: { type: "video", aspect_ratio: "16:9" },
      generation_config: { video_config: { task: "text_to_video" } },
      background: false,
      store: false,
      stream: false,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini video ${response.status}: ${text.slice(0, 300)}`);
  const payload = JSON.parse(text) as {
    steps?: Array<{
      type?: string;
      content?: Array<{ type?: string; data?: string; mime_type?: string }>;
    }>;
  };
  const video = payload.steps
    ?.flatMap((step) => step.content ?? [])
    .find((part) => part.type === "video" && part.data);
  if (!video?.data) throw new Error("Gemini video returned no media");
  return `data:${video.mime_type ?? "video/mp4"};base64,${video.data}`;
}

async function generatePixazoVideo(prompt: string, modelId: string): Promise<string> {
  const key = process.env.PIXAZO_API_KEY;
  if (!key) throw new Error("Server missing PIXAZO_API_KEY");
  const endpoint = VIDEO_ENDPOINTS[modelId];
  if (!endpoint) throw new Error(`Unknown Pixazo video model: ${modelId}`);
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Ocp-Apim-Subscription-Key": key,
  };

  async function attempt(p: string): Promise<string> {
    const body: Record<string, unknown> = {
      prompt: p.slice(0, 1000),
      duration: 5,
      resolution: modelId === "pixverse-v6" || modelId === "heygen-3-0" ? "540p" : "480p",
      generate_audio: false,
      aspect_ratio: "16:9",
      sync_mode: false,
    };
    const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 422 || isContentFlag(text))
        throw new Error(`Pixazo content-flagged: ${text.slice(0, 200)}`);
      throw new Error(`Pixazo video ${res.status}: ${text.slice(0, 300)}`);
    }
    let json: {
      request_id?: string;
      polling_url?: string;
      output?: { media_url?: string[] | string };
    };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Pixazo returned non-JSON");
    }
    const directRaw = json.output?.media_url;
    const direct = Array.isArray(directRaw) ? directRaw[0] : directRaw;
    if (direct) return await fetchAsDataUrl(direct);
    const polling =
      json.polling_url ??
      (json.request_id ? `https://gateway.pixazo.ai/v2/requests/status/${json.request_id}` : null);
    if (!polling) throw new Error("Pixazo video response missing polling_url");
    const started = Date.now();
    const TIMEOUT_MS = 180_000;
    while (Date.now() - started < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 2500));
      const pr = await fetch(polling, { headers: { "Ocp-Apim-Subscription-Key": key! } });
      const ptext = await pr.text();
      if (!pr.ok) {
        if (pr.status === 422 || isContentFlag(ptext))
          throw new Error(`Pixazo content-flagged: ${ptext.slice(0, 200)}`);
        continue;
      }
      let pj: {
        status?: string;
        error?: string | null;
        output?: { media_url?: string[] | string };
      };
      try {
        pj = JSON.parse(ptext);
      } catch {
        continue;
      }
      if (pj.status === "COMPLETED") {
        const raw = pj.output?.media_url;
        const url = Array.isArray(raw) ? raw[0] : raw;
        if (!url) throw new Error("Pixazo video completed without media_url");
        return await fetchAsDataUrl(url);
      }
      if (pj.status === "FAILED" || pj.status === "ERROR") {
        const errStr = pj.error ?? "unknown";
        if (isContentFlag(errStr)) throw new Error(`Pixazo content-flagged: ${errStr}`);
        throw new Error(`Pixazo video failed: ${errStr}`);
      }
    }
    throw new Error("Pixazo video timed out");
  }

  try {
    return await attempt(prompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("content-flagged")) {
      console.warn(`[video:${modelId}] content-flagged; retrying with softened prompt`);
      return await attempt(softenPrompt(prompt));
    }
    throw err;
  }
}

export async function mintGeminiLiveToken(): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Server missing GEMINI_API_KEY");
  const now = Date.now();
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini Live token ${res.status}: ${text.slice(0, 300)}`);
  let json: { name?: string };
  try {
    json = JSON.parse(text) as { name?: string };
  } catch {
    throw new Error("Gemini Live token service returned non-JSON");
  }
  if (!json.name) throw new Error("Gemini Live token response is missing its name");
  return json.name;
}
