import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { VOICES, getVoice, setVoice } from "@/lib/game/voices";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function VoiceSelect() {
  const [voice, setV] = useState<string>("Kore");
  useEffect(() => {
    setV(getVoice());
    const sync = () => setV(getVoice());
    window.addEventListener("ia-voice-change", sync);
    return () => window.removeEventListener("ia-voice-change", sync);
  }, []);
  return (
    <Select
      value={voice}
      onValueChange={(v) => {
        setVoice(v);
        setV(v);
      }}
    >
      <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Narrator voice">
        <Volume2 className="h-3.5 w-3.5 mr-1 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {VOICES.map((v) => (
          <SelectItem key={v.id} value={v.id} className="text-xs">
            <div className="flex flex-col">
              <span className="font-medium">
                {v.label} <span className="text-muted-foreground">· {v.gender}</span>
              </span>
              <span className="text-[10px] text-muted-foreground max-w-[240px] whitespace-normal">
                {v.description}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
