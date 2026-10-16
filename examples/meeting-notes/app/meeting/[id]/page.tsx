"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleAlert, Copy, FileQuestion, RefreshCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/blocks/app-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { NotesView } from "@/components/notes-view";
import { ProgressSteps } from "@/components/status-chips";
import { formatDate, formatDuration } from "@/lib/format";
import { LANGUAGES } from "@/lib/limits";
import { meetingToMarkdown } from "@/lib/markdown";
import { effectiveMeeting, retrySummary } from "@/lib/pipeline";
import { deleteMeeting, useMeeting } from "@/lib/store";

function BackLink() {
  return (
    <Link
      href="/"
      className="mb-6 inline-flex items-center gap-1.5 rounded-md text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-4" aria-hidden /> Meetings
    </Link>
  );
}

export default function MeetingPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const router = useRouter();
  const stored = useMeeting(id);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState === "idle") return;
    const t = setTimeout(() => setCopyState("idle"), 2500);
    return () => clearTimeout(t);
  }, [copyState]);

  if (stored === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-8 w-2/3" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (stored === null) {
    return (
      <>
        <BackLink />
        <EmptyState
          icon={<FileQuestion />}
          title="Meeting not found"
          description="Notes are stored in the browser that recorded them."
          action={
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "mt-1")}>
              Back to meetings
            </Link>
          }
        />
      </>
    );
  }

  const meeting = effectiveMeeting(stored);
  const processing = meeting.status === "transcribing" || meeting.status === "summarizing";
  const language = LANGUAGES.find((l) => l.code === meeting.language)?.label;
  const meta = [formatDate(meeting.createdAt), meeting.durationSec ? formatDuration(meeting.durationSec) : null, language]
    .filter(Boolean)
    .join(" · ");

  async function copy() {
    try {
      await navigator.clipboard.writeText(meetingToMarkdown(meeting));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function remove() {
    await deleteMeeting(meeting.id);
    router.push("/");
  }

  const hasContent = Boolean(meeting.summary || meeting.transcript);
  const actions = (
    <div className="flex items-center gap-1">
      {hasContent && (
        <Button variant="outline" className="max-sm:size-9" onClick={() => void copy()}>
          {copyState === "copied" ? <Check /> : <Copy />}
          <span className="sr-only sm:not-sr-only">
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Could not copy" : "Copy as Markdown"}
          </span>
        </Button>
      )}
      <Dialog>
        <DialogTrigger asChild>
          {hasContent ? (
            <Button variant="ghost" size="icon" aria-label="Delete meeting">
              <Trash2 />
            </Button>
          ) : (
            <Button variant="outline">
              <Trash2 /> Delete meeting
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this meeting?</DialogTitle>
            <DialogDescription>
              The notes and transcript are removed from this browser. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void remove()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <>
      <BackLink />
      <PageHeader
        title={meeting.title}
        description={meta}
        actions={hasContent ? undefined : actions}
      />

      <div className="flex flex-col gap-6">
        {processing && <ProgressSteps status={meeting.status} />}

        {meeting.status === "error" && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>{meeting.transcript ? "The notes could not be written" : "Transcription failed"}</AlertTitle>
            <AlertDescription>
              <p>{meeting.error}</p>
              {meeting.transcript ? (
                <Button className="mt-2" variant="outline" size="sm" onClick={() => void retrySummary(meeting.id)}>
                  <RefreshCw /> Retry
                </Button>
              ) : (
                <>
                  <p>The audio is not kept, so record or upload it again.</p>
                  <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 text-foreground")}>
                    New meeting
                  </Link>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {hasContent && (
          <Tabs
            key={meeting.summary ? "notes" : "transcript"}
            defaultValue={meeting.summary ? "notes" : "transcript"}
            className="gap-4"
          >
            <div className="flex items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="notes" disabled={!meeting.summary}>
                  Notes
                </TabsTrigger>
                <TabsTrigger value="transcript" disabled={!meeting.transcript}>
                  Transcript
                </TabsTrigger>
              </TabsList>
              {actions}
            </div>
            <TabsContent value="notes">
              <NotesView meeting={meeting} />
            </TabsContent>
            <TabsContent value="transcript">
              <div className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
                <p className="text-sm leading-6 whitespace-pre-wrap text-pretty">{meeting.transcript}</p>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}
