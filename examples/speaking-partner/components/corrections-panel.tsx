import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/blocks/empty-state";
import { MessageSquareText } from "lucide-react";
import type { LanguageCode } from "../lib/languages";
import type { CorrectionItem } from "../lib/use-corrections";

export const CATEGORY_LABEL: Record<string, string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  "word-choice": "Word choice",
  "pronunciation-guess": "Sounds like",
  register: "Register",
  other: "Other",
};

function Tag({ children }: { children: React.ReactNode }) {
  return <Badge variant="outline" className="font-normal text-muted-foreground">{children}</Badge>;
}

export function CorrectionCard({
  item,
  target,
  native,
  onRetry,
  showCategory = true,
}: {
  item: CorrectionItem;
  target: LanguageCode;
  native: LanguageCode;
  onRetry?: (turn: number) => void;
  showCategory?: boolean;
}) {
  if (item.status === "pending") {
    return (
      <li className="flex flex-col gap-2 px-4 py-3" aria-busy="true" aria-label="Checking this line">
        <p lang={target} className="text-sm text-muted-foreground">{item.text}</p>
        <Skeleton className="h-3 w-2/3" />
      </li>
    );
  }
  if (item.status === "error") {
    return (
      <li className="flex flex-col items-start gap-2 px-4 py-3">
        <p lang={target} className="text-sm text-muted-foreground">{item.text}</p>
        <p className="text-xs text-muted-foreground">
          {item.reason === "no_key" ? "No corrections key is set on the server." : "Could not check this line."}
        </p>
        {item.reason === "failed" && onRetry ? (
          <Button variant="outline" size="sm" onClick={() => onRetry(item.turn)}>
            Retry
          </Button>
        ) : null}
      </li>
    );
  }
  const c = item.correction;
  if (!c.hasIssue) {
    return (
      <li className="flex flex-col gap-1 px-4 py-3">
        <p lang={target} className="text-sm">{item.text}</p>
        <p className="text-xs text-muted-foreground">No issues found.</p>
      </li>
    );
  }
  return (
    <li className="flex flex-col items-start gap-1 px-4 py-3">
      {showCategory ? (
        <div className="pb-1">
          <Tag>{CATEGORY_LABEL[c.category] ?? c.category}</Tag>
        </div>
      ) : null}
      <p lang={target} className="text-sm text-muted-foreground line-through decoration-destructive/60">{item.text}</p>
      <p lang={target} className="text-sm font-medium">{c.corrected}</p>
      {c.explanation ? <p lang={native} className="text-xs text-muted-foreground">{c.explanation}</p> : null}
    </li>
  );
}

export function CorrectionsPanel({
  items,
  target,
  native,
  enabled,
  onRetry,
}: {
  items: CorrectionItem[];
  target: LanguageCode;
  native: LanguageCode;
  enabled: boolean;
  onRetry: (turn: number) => void;
}) {
  if (!enabled) {
    return (
      <EmptyState
        className="h-full justify-center border-0 [&>span:first-child]:bg-secondary"
        icon={<MessageSquareText />}
        title="Written corrections are off"
        description={
          <>
            Set <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> or <code className="font-mono text-xs">OPENAI_API_KEY</code> on the server to turn them on.
          </>
        }
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        className="h-full justify-center border-0 [&>span:first-child]:bg-secondary"
        icon={<MessageSquareText />}
        title="Nothing to check yet"
        description="After each line you say, a check shows up here."
      />
    );
  }
  return (
    <ul className="divide-y divide-border" aria-live="polite" aria-label="Corrections">
      {[...items].reverse().map((item) => (
        <CorrectionCard key={item.turn} item={item} target={target} native={native} onRetry={onRetry} />
      ))}
    </ul>
  );
}
