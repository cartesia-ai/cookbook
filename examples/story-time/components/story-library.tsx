"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, ChevronRight, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/blocks/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteStory, useStories } from "@/lib/store";
import { isFinished, themeLabel, TOTAL_SCENES, type Story } from "@/lib/story";

function meta(s: Story): string {
  const themes = themeLabel(s.themes);
  const progress = isFinished(s) ? `${TOTAL_SCENES} scenes` : `Scene ${Math.max(1, s.scenes.length)} of ${TOTAL_SCENES}`;
  const date = new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return [s.hero, themes, progress, date].filter(Boolean).join(" · ");
}

export function StoryLibrary() {
  const stories = useStories();
  const [removing, setRemoving] = useState<Story | null>(null);

  return (
    <section className="mt-10 flex flex-col gap-4" aria-labelledby="library">
      <h2 id="library" className="text-sm font-medium">
        Library
      </h2>
      {stories === undefined ? null : stories.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="No stories yet"
          description="Finished stories and their narration stay in this browser. Replaying one makes no API calls."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {stories.map((s) => (
            <li key={s.id} className="flex min-h-14 items-center gap-2 py-2 pr-2 pl-4">
              <Link href={`/story/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{s.title || "Untitled story"}</span>
                  <span className="truncate text-xs text-muted-foreground">{meta(s)}</span>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.title || "story"}`} onClick={() => setRemoving(s)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this story?</DialogTitle>
            <DialogDescription>The text and the narration are removed from this browser.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep it</Button>
            </DialogClose>
            <Button
              variant="outline"
              className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive dark:border-destructive/40 dark:bg-destructive/15"
              onClick={() => {
                if (removing) void deleteStory(removing.id);
                setRemoving(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
