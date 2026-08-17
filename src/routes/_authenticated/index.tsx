import { lazy, Suspense, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Copy,
  Download,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { EmberField } from "@/components/EmberField";
import { TopBar } from "@/components/TopBar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import * as saveStore from "@/lib/game/saves";
import type { GameState } from "@/lib/game/types";
import { getGenreTheme, themeVars } from "@/lib/game/genre-theme";

export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});

type DashboardSave = {
  id: string;
  title: string;
  genre: string | null;
  state?: GameState;
  created_at: string;
  updated_at: string;
  protagonist_name?: string;
  tone?: string;
  scene_count?: number;
  cover_image_url?: string | null;
};

type SaveActions = typeof saveStore & {
  renameSave?: (id: string, title: string) => Promise<void>;
  duplicateSaveSetup?: (id: string) => Promise<DashboardSave>;
  exportSaveData?: (id: string) => Promise<string>;
};

const saveActions = saveStore as SaveActions;

const StoryBuilder = lazy(() =>
  import("@/components/story-builder/StoryBuilder").then((module) => ({
    default: module.StoryBuilder,
  })),
);

function HomePage() {
  const queryClient = useQueryClient();
  const [renameTarget, setRenameTarget] = useState<DashboardSave | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DashboardSave | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  const {
    data: saves = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["saves"],
    queryFn: saveStore.listSaves,
  });
  const dashboardSaves = saves as DashboardSave[];

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      if (!saveActions.renameSave) throw new Error("Rename is not available in this build yet.");
      await saveActions.renameSave(id, title);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["saves"] });
      setRenameTarget(null);
      toast.success("Story renamed.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Could not rename the story.",
      );
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!saveActions.duplicateSaveSetup) {
        throw new Error("Duplicate setup is not available in this build yet.");
      }
      return saveActions.duplicateSaveSetup(id);
    },
    onSuccess: async (copy) => {
      await queryClient.invalidateQueries({ queryKey: ["saves"] });
      toast.success(`Created “${copy.title}”. Its story starts from page one.`);
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Could not duplicate the setup.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: saveStore.deleteSave,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["saves"] });
      setDeleteTarget(null);
      toast.success("Story deleted.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Could not delete the story.",
      );
    },
  });

  function openRename(save: DashboardSave) {
    setRenameTarget(save);
    setRenameTitle(save.title);
  }

  function submitRename(event: React.FormEvent) {
    event.preventDefault();
    if (!renameTarget) return;
    const title = renameTitle.trim();
    if (title.length < 3) {
      toast.error("Use at least 3 characters for the title.");
      return;
    }
    renameMutation.mutate({ id: renameTarget.id, title });
  }

  async function exportStory(save: DashboardSave) {
    setExportingId(save.id);
    try {
      const json = saveActions.exportSaveData
        ? await saveActions.exportSaveData(save.id)
        : JSON.stringify(save, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeFileName(save.title)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Story exported as JSON.");
    } catch (exportError) {
      toast.error(
        exportError instanceof Error ? exportError.message : "Could not export the story.",
      );
    } finally {
      setExportingId(null);
    }
  }

  return (
    <div className="relative min-h-screen">
      <EmberField count={12} />
      <TopBar />
      <main className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--accent)]">
              Infinite Tale Weaver
            </p>
            <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">
              Your story shelf
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Return to a tale in progress or shape a new world from its first spark.
            </p>
          </div>
          <Button
            size="lg"
            className="rune-btn px-5 font-medium"
            onClick={() => setBuilderOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create new story
          </Button>
        </header>

        <div className="my-8 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        {isLoading ? (
          <LoadingShelf />
        ) : isError ? (
          <ErrorShelf error={error} onRetry={() => void refetch()} />
        ) : dashboardSaves.length === 0 ? (
          <EmptyShelf onCreate={() => setBuilderOpen(true)} />
        ) : (
          <section aria-label="Saved stories" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dashboardSaves.map((save) => (
              <StoryCard
                key={save.id}
                save={save}
                exporting={exportingId === save.id}
                duplicating={duplicateMutation.isPending && duplicateMutation.variables === save.id}
                onRename={() => openRename(save)}
                onDuplicate={() => duplicateMutation.mutate(save.id)}
                onExport={() => void exportStory(save)}
                onDelete={() => setDeleteTarget(save)}
              />
            ))}
          </section>
        )}
      </main>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(nextOpen) => !nextOpen && !renameMutation.isPending && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitRename}>
            <DialogHeader>
              <DialogTitle>Rename this story</DialogTitle>
              <DialogDescription>
                This changes the shelf title without changing the story itself.
              </DialogDescription>
            </DialogHeader>
            <div className="my-5 space-y-2">
              <Label htmlFor="rename-story">Story title</Label>
              <Input
                id="rename-story"
                value={renameTitle}
                onChange={(event) => setRenameTitle(event.target.value)}
                autoFocus
                maxLength={100}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRenameTarget(null)}
                disabled={renameMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={renameMutation.isPending || renameTitle.trim().length < 3}
              >
                {renameMutation.isPending ? "Saving…" : "Save title"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => !nextOpen && !deleteMutation.isPending && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its scenes, artwork, and progress will be permanently removed. Export a copy first if
              you may want it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Keep story</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {builderOpen && (
        <Suspense
          fallback={
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-3 rounded-xl border bg-card px-5 py-4 shadow-2xl">
                <RefreshCw className="h-4 w-4 animate-spin text-[var(--accent)]" />
                Preparing the Story Builder…
              </div>
            </div>
          }
        >
          <StoryBuilder
            open={builderOpen}
            onOpenChange={setBuilderOpen}
            trigger={<button type="button" className="hidden" tabIndex={-1} aria-hidden="true" />}
          />
        </Suspense>
      )}
    </div>
  );
}

function StoryCard({
  save,
  exporting,
  duplicating,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: {
  save: DashboardSave;
  exporting: boolean;
  duplicating: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const genre = save.genre || save.state?.meta.genre || "Adventure";
  const theme = getGenreTheme(genre);
  const Icon = theme.icon;
  const protagonist =
    save.protagonist_name || save.state?.meta.protagonist_name || "Protagonist unnamed";
  const tone = save.tone || save.state?.meta.tone;
  const sceneCount = save.scene_count ?? save.state?.scenes?.length ?? 0;
  const cover =
    save.cover_image_url ||
    [...(save.state?.scenes ?? [])].reverse().find((scene) => scene.image_data_url)?.image_data_url;

  return (
    <article
      className="group overflow-hidden rounded-2xl border bg-card/80 shadow-lg transition duration-200 hover:-translate-y-1 hover:border-[var(--accent)]/60 hover:shadow-2xl"
      style={themeVars(genre)}
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-white/10 bg-background">
        {cover && isVideoMedia(cover) ? (
          <video
            src={cover}
            aria-hidden="true"
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : cover ? (
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="grid h-full place-items-center"
            style={{
              background:
                "radial-gradient(circle at 28% 20%, var(--accent-glow), transparent 35%), linear-gradient(145deg, oklch(0.22 0.025 60), oklch(0.12 0.012 60))",
            }}
          >
            <Icon className="h-10 w-10 text-[var(--accent)] opacity-80" />
          </div>
        )}
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/65 px-2.5 py-1 text-xs text-white backdrop-blur">
          <Icon className="h-3 w-3 text-[var(--accent)]" />
          {genre}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-3 top-3 h-8 w-8 bg-black/65 text-white backdrop-blur hover:bg-black/85"
              aria-label={`Actions for ${save.title}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onRename}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate} disabled={duplicating}>
              <Copy /> {duplicating ? "Duplicating…" : "Duplicate setup"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExport} disabled={exporting}>
              <Download /> {exporting ? "Preparing…" : "Export JSON"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-56 flex-col p-5">
        <div>
          <h2 className="line-clamp-2 font-display text-2xl leading-tight transition-colors group-hover:text-[var(--accent)]">
            {save.title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{protagonist}</p>
          {tone && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{tone}</p>}
        </div>

        <div className="mt-auto pt-6">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {sceneCount === 0
                ? "Ready for page one"
                : `${sceneCount} ${sceneCount === 1 ? "scene" : "scenes"}`}
            </span>
            <time dateTime={save.updated_at}>{relativeDate(save.updated_at)}</time>
          </div>
          <Button asChild className="w-full rune-btn">
            <Link to="/play/$saveId" params={{ saveId: save.id }}>
              <Play className="mr-2 h-4 w-4" />
              {sceneCount ? "Continue story" : "Begin story"}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function LoadingShelf() {
  return (
    <section
      aria-label="Loading saved stories"
      aria-busy="true"
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index} className="overflow-hidden bg-card/70">
          <Skeleton className="aspect-[16/9] w-full rounded-none" />
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-7 w-4/5" />
            <Skeleton className="h-4 w-1/2" />
            <div className="pt-10">
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      ))}
      <span className="sr-only">Loading your stories…</span>
    </section>
  );
}

function ErrorShelf({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Card className="border-destructive/30 bg-card/80">
      <CardContent className="flex flex-col items-center px-6 py-14 text-center">
        <BookOpen className="h-8 w-8 text-destructive" />
        <h2 className="mt-4 font-display text-2xl">The shelf could not be opened</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {error instanceof Error
            ? error.message
            : "Your stories are safe, but they could not be loaded right now."}
        </p>
        <Button type="button" variant="outline" onClick={onRetry} className="mt-5">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyShelf({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="overflow-hidden border-dashed bg-card/60">
      <CardContent className="relative flex flex-col items-center px-6 py-16 text-center sm:py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--accent-glow),transparent_42%)] opacity-30" />
        <div className="relative">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]">
            <Sparkles className="h-6 w-6" />
          </span>
          <h2 className="mt-5 font-display text-3xl">Every tale starts with a spark</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            Your shelf is empty. Shape a world, meet its protagonist, and let Infinite Tale Weaver
            open the first page.
          </p>
          <div className="mt-6 flex justify-center">
            <Button size="lg" className="rune-btn" onClick={onCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first story
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function relativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return formatter.format(months, "month");
  return formatter.format(Math.round(months / 12), "year");
}

function safeFileName(value: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "infinite-tale-weaver-export";
}

function isVideoMedia(value: string): boolean {
  return value.startsWith("data:video/") || /\.(mp4|webm|mov)(?:$|[?#])/i.test(value);
}
