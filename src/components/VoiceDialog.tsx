import { useEffect, useRef, useState } from "react";
import { Mic, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

import type { VoiceRequest } from "@/lib/game/types";
import { startVoiceSession, type VoiceHandle } from "@/lib/game/realtime";

export function VoiceDialog({
  open,
  onOpenChange,
  request,
  onEnded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: VoiceRequest | null;
  onEnded: (transcript: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "ending">("idle");
  const [lines, setLines] = useState<{ speaker: "player" | "character"; text: string }[]>([]);
  const [partial, setPartial] = useState("");
  const handleRef = useRef<VoiceHandle | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const endingRef = useRef(false);

  useEffect(() => {
    if (!open || !request) return;
    let cancelled = false;
    const abortController = new AbortController();
    endingRef.current = false;
    setStatus("connecting");
    setLines([]);
    setPartial("");

    (async () => {
      try {
        const audio = new Audio();
        audio.autoplay = true;
        audioRef.current = audio;
        const handle = await startVoiceSession(
          request,
          audio,
          (evt) => {
            if (cancelled) return;
            switch (evt.type) {
              case "connected":
                setStatus("live");
                break;
              case "user_transcript":
                setLines((prev) => [...prev, { speaker: "player", text: evt.text }]);
                break;
              case "user_transcript_replace":
                setLines((prev) => {
                  for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].speaker === "player") {
                      const next = prev.slice();
                      next[i] = { speaker: "player", text: evt.text };
                      return next;
                    }
                  }
                  return [...prev, { speaker: "player", text: evt.text }];
                });
                break;
              case "assistant_transcript_delta":
                setPartial((p) => p + evt.text);
                break;
              case "assistant_transcript_final":
                setPartial("");
                setLines((prev) => [...prev, { speaker: "character", text: evt.text }]);
                break;
              case "error":
                toast.error(evt.message);
                break;
              case "closed":
                void end();
                break;
            }
          },
          abortController.signal,
        );
        if (cancelled) {
          await handle.end();
          return;
        }
        handleRef.current = handle;
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          toast.error(err instanceof Error ? err.message : "Could not start voice");
          onOpenChange(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
      handleRef.current?.end().catch(() => {});
      handleRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request]);

  async function end() {
    if (endingRef.current) return;
    endingRef.current = true;
    setStatus("ending");
    try {
      const result = await handleRef.current?.end();
      handleRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
      onOpenChange(false);
      onEnded(result?.transcript ?? "");
    } catch {
      onOpenChange(false);
      onEnded("");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) end();
        else onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Speaking to {request?.character_name}
          </DialogTitle>
          <DialogDescription>
            {status === "connecting"
              ? "Connecting…"
              : status === "live"
                ? "Live voice conversation. Speak naturally."
                : "Wrapping up…"}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-64 rounded border bg-muted/30 p-3">
          <div className="space-y-2 text-sm">
            {lines.map((l, i) => (
              <div key={i} className={l.speaker === "player" ? "text-right" : ""}>
                <span className="text-xs uppercase tracking-wide text-muted-foreground mr-2">
                  {l.speaker === "player" ? "You" : request?.character_name}
                </span>
                <span>{l.text}</span>
              </div>
            ))}
            {partial && (
              <div className="opacity-70">
                <span className="text-xs uppercase tracking-wide text-muted-foreground mr-2">
                  {request?.character_name}
                </span>
                <span>{partial}</span>
              </div>
            )}
            {status === "connecting" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Warming the line…
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="flex justify-end">
          <Button variant="destructive" onClick={end}>
            <PhoneOff className="mr-1 h-4 w-4" /> End conversation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
