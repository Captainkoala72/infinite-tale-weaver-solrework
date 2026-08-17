import { useState } from "react";
import { ImageIcon, Loader2, Sparkles, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getFont } from "@/lib/game/fonts";
import { speakSummary, speakText } from "@/lib/game/tts";
import type { GameState, SceneRecord } from "@/lib/game/types";

export function SceneBlock({
  scene,
  sceneNumber,
  isLatest,
  state,
}: {
  scene: SceneRecord;
  sceneNumber: number;
  isLatest: boolean;
  state: GameState;
}) {
  const [playing, setPlaying] = useState<null | "full" | "summary">(null);
  const fontFamily = getFont(state.meta.narrator_font).family;
  const narrationId = `scene-${scene.id}-narration`;
  const isVideo =
    !!scene.image_data_url &&
    (scene.image_data_url.startsWith("data:video") ||
      /\.(mp4|webm|mov)(\?|$)/i.test(scene.image_data_url));

  async function handlePlayback(kind: "full" | "summary") {
    if (playing) return;
    setPlaying(kind);
    try {
      if (kind === "full") await speakText(scene.narration, state);
      else await speakSummary(scene.narration, state);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voice playback failed");
    } finally {
      setPlaying(null);
    }
  }

  return (
    <article aria-labelledby={narrationId} className={`space-y-3 ${isLatest ? "scene-enter" : ""}`}>
      <h2 id={narrationId} className="sr-only">
        Scene {sceneNumber}
      </h2>
      {(scene.image_data_url || state.meta.image_enabled !== false) && (
        <div className="hud-frame relative aspect-[16/9] overflow-hidden rounded-lg border border-white/10 bg-black/60">
          {scene.image_data_url ? (
            isVideo ? (
              <video
                src={scene.image_data_url}
                aria-label={`Generated video for scene ${sceneNumber}`}
                className="h-full w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={scene.image_data_url}
                alt={`Generated illustration for scene ${sceneNumber}`}
                className="h-full w-full object-cover"
                loading={isLatest ? "eager" : "lazy"}
              />
            )
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-muted-foreground"
              role="status"
            >
              <ImageIcon className="mr-2 h-6 w-6 animate-pulse opacity-50" aria-hidden="true" />
              <span className="text-xs">Painting the scene…</span>
            </div>
          )}
        </div>
      )}

      <div
        className={`hud-panel relative rounded-md p-4 sm:p-5 ${isLatest ? "" : "opacity-85"}`}
        style={{
          boxShadow: isLatest
            ? "inset 0 0 24px -12px var(--accent-glow), 0 20px 40px -20px oklch(0 0 0 / 60%)"
            : undefined,
        }}
      >
        <div
          className="whitespace-pre-wrap text-[15px] leading-7 sm:text-base"
          style={{ fontFamily }}
        >
          {scene.narration}
        </div>
      </div>

      {scene.narration && (
        <div
          className="flex flex-wrap gap-2"
          aria-label={`Playback options for scene ${sceneNumber}`}
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handlePlayback("full")}
            disabled={!!playing}
            className="border-white/10 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {playing === "full" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Volume2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Hear scene
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handlePlayback("summary")}
            disabled={!!playing}
            className="border-white/10 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {playing === "summary" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Hear summary
          </Button>
        </div>
      )}
    </article>
  );
}
