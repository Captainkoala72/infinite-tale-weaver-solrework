import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { BookOpenText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signInWithGoogle, waitForAuth } from "@/integrations/firebase/auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Infinite Tale Weaver" },
      { name: "description", content: "Sign in to continue weaving your adventures." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void waitForAuth()
      .then((user) => {
        if (active && user) void navigate({ to: "/", replace: true });
      })
      .catch((error) => {
        console.error("Firebase Auth could not initialise", error);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function google(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithGoogle();
      await router.invalidate();
      await navigate({ to: "/", replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign-in did not complete.";
      if (!message.toLowerCase().includes("popup-closed-by-user")) toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/30 p-4">
      <Card className="w-full max-w-md border-border/60 shadow-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <BookOpenText className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <CardTitle className="font-display text-3xl">Infinite Tale Weaver</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Sign in to keep every world, character, and chapter safely in your private library.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" size="lg" onClick={google} disabled={busy}>
            {busy ? "Opening Google…" : "Continue with Google"}
          </Button>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            Your adventures are visible only to the Google account that created them.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
