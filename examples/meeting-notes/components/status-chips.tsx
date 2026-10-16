import { LoaderCircle } from "lucide-react";
import { Steps } from "@/components/blocks/steps";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MeetingStatus } from "@/lib/schema";

const LABELS: Record<MeetingStatus, string> = {
  transcribing: "Transcribing",
  summarizing: "Writing notes",
  ready: "Ready",
  error: "Failed",
};

export function StatusChip({ status, className }: { status: MeetingStatus; className?: string }) {
  const busy = status === "transcribing" || status === "summarizing";
  return (
    <Badge
      variant={status === "error" ? "outline" : "secondary"}
      className={cn(status === "error" && "border-destructive/40 text-destructive", className)}
    >
      {busy && <LoaderCircle className="animate-spin" aria-hidden />}
      {LABELS[status]}
    </Badge>
  );
}

export function ProgressSteps({ status }: { status: MeetingStatus }) {
  const current = status === "transcribing" ? 0 : status === "summarizing" ? 1 : 2;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <Steps steps={["Transcribing the audio with Ink", "Writing the notes"]} current={current} />
    </div>
  );
}
