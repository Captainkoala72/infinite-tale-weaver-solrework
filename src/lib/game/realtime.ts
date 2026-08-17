import { aiLiveVoiceToken } from "./ai.functions";
import type { VoiceRequest } from "./types";

export type VoiceEventHandler = (event: VoiceEvent) => void;

export type VoiceEvent =
  | { type: "connected" }
  | { type: "user_transcript"; text: string }
  | { type: "user_transcript_replace"; text: string }
  | { type: "assistant_transcript_delta"; text: string }
  | { type: "assistant_transcript_final"; text: string }
  | { type: "error"; message: string }
  | { type: "closed" };

export type VoiceHandle = {
  end: () => Promise<{ transcript: string }>;
};

const INPUT_SAMPLE_RATE = 16_000;
const OUTPUT_SAMPLE_RATE = 24_000;
const SCRIPT_BUFFER = 4096;

function buildInstructions(request: VoiceRequest): string {
  return `You are ${request.character_name}. Stay fully in character throughout this voice call.

Character profile:
${request.character_profile}

Current situation:
${request.context}

Things you CAN do or give:
${request.allowed_actions.map((action) => `- ${action}`).join("\n")}

Things you WILL NOT do or reveal:
${request.restrictions.map((restriction) => `- ${restriction}`).join("\n")}

VOICE AND TONE:
- Speak with clear, human emotion that matches the moment.
- Match the world's register, vocabulary, and cadence.
- Keep every reply short and conversational, usually one to three sentences.
- Never break the fourth wall or narrate stage directions.
- If asked for something outside your allowed actions, refuse in character.
- This is a brief exchange. Let the conversation reach a natural parting point.`;
}

function float32ToPcm16Base64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const aligned = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(aligned).set(bytes);
  const pcm = new Int16Array(aligned);
  const samples = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) samples[index] = pcm[index] / 32768;
  return samples;
}

function mergeTranscript(current: string, incoming: string): string {
  const next = incoming.trim();
  if (!next) return current;
  if (!current) return next;
  if (next.startsWith(current)) return next;
  if (current.endsWith(next)) return current;
  return `${current}${/^[,.;!?]/.test(next) ? "" : " "}${next}`;
}

function resample(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === INPUT_SAMPLE_RATE) return new Float32Array(input);
  const ratio = INPUT_SAMPLE_RATE / inputRate;
  const output = new Float32Array(Math.max(1, Math.floor(input.length * ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const sourceIndex = index / ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, input.length - 1);
    const amount = sourceIndex - left;
    output[index] = input[left] * (1 - amount) + input[right] * amount;
  }
  return output;
}

export async function startVoiceSession(
  request: VoiceRequest,
  _audioElement: HTMLAudioElement,
  onEvent: VoiceEventHandler,
  signal?: AbortSignal,
): Promise<VoiceHandle> {
  let mediaStream: MediaStream;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new Error(
        "Microphone permission was denied. Allow microphone access for this site, then try again.",
      );
    }
    throw error;
  }
  if (signal?.aborted) {
    mediaStream.getTracks().forEach((track) => track.stop());
    throw new DOMException("Voice session cancelled", "AbortError");
  }

  let token: string;
  try {
    ({ token } = await aiLiveVoiceToken());
  } catch (error) {
    mediaStream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  if (signal?.aborted) {
    mediaStream.getTracks().forEach((track) => track.stop());
    throw new DOMException("Voice session cancelled", "AbortError");
  }

  const endpoint =
    "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
  const websocket = new WebSocket(`${endpoint}?access_token=${encodeURIComponent(token)}`);
  const transcript: Array<{ speaker: "Player" | string; text: string }> = [];
  let currentUser = "";
  let currentAssistant = "";
  let userWasEmitted = false;
  let ready = false;
  let ended = false;
  let abortHandler: (() => void) | null = null;

  const outputContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
  void outputContext.resume().catch(() => {});
  let playHead = 0;

  function playPcm(samples: Float32Array): void {
    if (!samples.length) return;
    const buffer = outputContext.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);
    const sourceNode = outputContext.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(outputContext.destination);
    const startAt = Math.max(outputContext.currentTime, playHead);
    sourceNode.start(startAt);
    playHead = startAt + buffer.duration;
  }

  let inputContext: AudioContext;
  try {
    inputContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
  } catch {
    inputContext = new AudioContext();
  }
  void inputContext.resume().catch(() => {});
  const microphone = inputContext.createMediaStreamSource(mediaStream);
  const processor = inputContext.createScriptProcessor(SCRIPT_BUFFER, 1, 1);
  const muted = inputContext.createGain();
  muted.gain.value = 0;
  microphone.connect(processor);
  processor.connect(muted);
  muted.connect(inputContext.destination);

  processor.onaudioprocess = (event) => {
    if (!ready || websocket.readyState !== WebSocket.OPEN) return;
    const samples = resample(event.inputBuffer.getChannelData(0), inputContext.sampleRate);
    websocket.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data: float32ToPcm16Base64(samples),
            mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
          },
        },
      }),
    );
  };

  websocket.addEventListener("open", () => {
    websocket.send(
      JSON.stringify({
        setup: {
          model: "models/gemini-3.1-flash-live-preview",
          responseModalities: ["AUDIO"],
          systemInstruction: { parts: [{ text: buildInstructions(request) }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          thinkingConfig: { thinkingLevel: "minimal" },
        },
      }),
    );
  });

  websocket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as {
        setupComplete?: object;
        error?: { message?: string };
        serverContent?: {
          modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> };
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
          turnComplete?: boolean;
          interrupted?: boolean;
        };
      };

      if (message.setupComplete && !ready) {
        ready = true;
        onEvent({ type: "connected" });
        websocket.send(
          JSON.stringify({
            realtimeInput: {
              text: "Open this conversation now with one short, natural line that fits the current situation.",
            },
          }),
        );
      }

      if (message.error) {
        onEvent({ type: "error", message: message.error.message ?? "Gemini Live error" });
      }

      const content = message.serverContent;
      if (!content) return;

      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) playPcm(base64PcmToFloat32(part.inlineData.data));
      }

      const userText = content.inputTranscription?.text;
      if (userText) {
        currentUser = mergeTranscript(currentUser, userText);
        onEvent({
          type: userWasEmitted ? "user_transcript_replace" : "user_transcript",
          text: currentUser,
        });
        userWasEmitted = true;
      }

      const assistantText = content.outputTranscription?.text;
      if (assistantText) {
        const previous = currentAssistant;
        currentAssistant = mergeTranscript(currentAssistant, assistantText);
        const delta = currentAssistant.startsWith(previous)
          ? currentAssistant.slice(previous.length).trimStart()
          : assistantText;
        if (delta) onEvent({ type: "assistant_transcript_delta", text: delta });
      }

      if (content.interrupted) currentAssistant = "";

      if (content.turnComplete) {
        if (currentUser) transcript.push({ speaker: "Player", text: currentUser });
        if (currentAssistant) {
          transcript.push({ speaker: request.character_name, text: currentAssistant });
          onEvent({ type: "assistant_transcript_final", text: currentAssistant });
        }
        currentUser = "";
        currentAssistant = "";
        userWasEmitted = false;
      }
    } catch {
      onEvent({ type: "error", message: "Gemini Live returned an unreadable response" });
    }
  });

  websocket.addEventListener("error", () => {
    if (!ended) onEvent({ type: "error", message: "Voice connection error" });
  });
  websocket.addEventListener("close", () => {
    if (!ended) void handle.end();
  });

  function finishCurrentTurn(): void {
    if (currentUser) transcript.push({ speaker: "Player", text: currentUser });
    if (currentAssistant) {
      transcript.push({ speaker: request.character_name, text: currentAssistant });
    }
    currentUser = "";
    currentAssistant = "";
    userWasEmitted = false;
  }

  function transcriptText(): string {
    return transcript.map((entry) => `${entry.speaker}: ${entry.text}`).join("\n");
  }

  const handle: VoiceHandle = {
    end: async () => {
      if (ended) {
        return { transcript: transcriptText() };
      }
      ended = true;
      finishCurrentTurn();
      if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
        microphone.disconnect();
        muted.disconnect();
      } catch {
        // Audio nodes may already be disconnected after a browser device change.
      }
      try {
        await inputContext.close();
      } catch {
        // The input context can already be closed by the browser.
      }
      mediaStream.getTracks().forEach((track) => track.stop());
      try {
        websocket.close();
      } catch {
        // The socket may already have closed remotely.
      }
      setTimeout(() => void outputContext.close().catch(() => {}), 250);
      onEvent({ type: "closed" });
      return { transcript: transcriptText() };
    },
  };

  abortHandler = () => void handle.end();
  if (signal?.aborted) {
    await handle.end();
    throw new DOMException("Voice session cancelled", "AbortError");
  }
  signal?.addEventListener("abort", abortHandler, { once: true });

  return handle;
}
