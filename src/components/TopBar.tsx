import { Link, useRouter } from "@tanstack/react-router";
import { LogOut, Home, ScrollText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { signOut as firebaseSignOut } from "@/integrations/firebase/auth";
import { Button } from "@/components/ui/button";

export function TopBar({ title, actions }: { title?: string; actions?: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await firebaseSignOut();
    await router.invalidate();
    await router.navigate({ to: "/auth", replace: true });
  }

  return (
    <header
      className="sticky top-0 z-20 border-b border-white/10 backdrop-blur-md"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.16 0.014 60 / 92%), oklch(0.14 0.014 60 / 82%))",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span
            className="grid place-items-center w-9 h-9 rounded-md border border-[var(--accent)]/60 text-[var(--accent)] glow-ring"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, oklch(0.28 0.05 70), oklch(0.16 0.02 60))",
            }}
            aria-hidden
          >
            <ScrollText className="h-4 w-4" />
          </span>
          <span className="font-display text-lg tracking-wider text-[var(--accent)] text-glow">
            Infinite&nbsp;Tale&nbsp;Weaver
          </span>
        </Link>
        {title ? (
          <span className="font-hud text-[10px] text-muted-foreground hidden sm:inline border-l border-white/10 pl-3 ml-1 truncate max-w-[24ch]">
            {title}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {actions}
          <Button asChild variant="ghost" size="sm" className="font-hud text-[11px]">
            <Link to="/">
              <Home className="sm:mr-1 h-4 w-4" />
              <span className="hidden sm:inline">Library</span>
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut} className="font-hud text-[11px]">
            <LogOut className="sm:mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
