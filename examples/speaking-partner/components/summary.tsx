import { Check, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/blocks/app-shell";
import { FormFooter, FormPanel, FormSection } from "@/components/blocks/form-section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { languageName, type LanguageCode } from "../lib/languages";
import type { Mission } from "../lib/missions";
import type { Mode } from "../lib/modes";
import { CATEGORY_LABEL, CorrectionCard } from "./corrections-panel";
import type { SessionResult } from "./session-view";
import { Shell } from "./shell";

const LEVELS = [
  { score: 1, name: "Tiro", meaning: "Struggled or leaned on your own language" },
  { score: 2, name: "Proficiens", meaning: "Understandable, with errors" },
  { score: 3, name: "Peritus", meaning: "Fluent" },
] as const;

const HEADLINE: Record<SessionResult["reason"], string> = {
  completed: "Mission complete",
  ended: "Session ended early",
  timeout: "Time is up",
};

export function Summary({
  result,
  mission,
  mode,
  target,
  native,
  onRetry,
  onNew,
}: {
  result: SessionResult;
  mission: Mission;
  mode: Mode;
  target: LanguageCode;
  native: LanguageCode;
  onRetry: () => void;
  onNew: () => void;
}) {
  const done = result.corrections.filter((c) => c.status === "done");
  const flagged = done.filter((c) => c.status === "done" && c.correction.hasIssue);
  const byCategory = new Map<string, typeof flagged>();
  for (const item of flagged) {
    const cat = item.status === "done" ? item.correction.category : "other";
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), item]);
  }
  const rated = result.reason === "completed" && mode === "immersive" && result.score;
  return (
    <Shell width="narrow">
      <PageHeader title={HEADLINE[result.reason]} description={`${mission.title}, in ${languageName(target)}.`} />

      <FormPanel>
        {rated ? (
          <FormSection title="Your level in this scene" description="Your partner rated the conversation when it ended.">
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {LEVELS.map((l) => {
                const on = l.score === result.score;
                return (
                  <li
                    key={l.score}
                    aria-current={on}
                    className={cn(
                      "flex flex-col gap-1 rounded-lg border p-3",
                      on ? "border-primary/40 bg-accent text-accent-foreground" : "border-border text-muted-foreground",
                    )}
                  >
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {on ? <Check aria-hidden className="size-3.5" /> : null}
                      {l.name}
                    </p>
                    <p className="text-xs leading-4">{l.meaning}</p>
                  </li>
                );
              })}
            </ol>
          </FormSection>
        ) : null}

        {result.pointers?.length ? (
          <FormSection title="What to work on">
            <ul lang={native} className="flex flex-col gap-2 text-sm">
              {result.pointers.map((p, i) => (
                <li key={i} className="flex gap-2.5">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  {p}
                </li>
              ))}
            </ul>
          </FormSection>
        ) : null}

        <FormSection
          title="Corrections"
          description={
            flagged.length === 0
              ? result.corrections.length === 0
                ? "No lines were checked in this session."
                : "No mistakes were flagged. Nice work."
              : `${flagged.length} of ${done.length} checked ${done.length === 1 ? "line" : "lines"} had something to fix.`
          }
        >
          {flagged.length ? (
            <div className="flex flex-col gap-4" aria-label="Corrections recap">
              {[...byCategory.entries()].map(([cat, items]) => (
                <div key={cat} className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-medium text-muted-foreground">{CATEGORY_LABEL[cat] ?? cat}</h3>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {items.map((item) => (
                      <CorrectionCard key={item.turn} item={item} target={target} native={native} showCategory={false} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </FormSection>

        <FormFooter>
          <Button variant="outline" onClick={onNew}>
            Another mission
          </Button>
          <Button className="sm:min-w-40" onClick={onRetry}>
            <RotateCcw /> Try again
          </Button>
        </FormFooter>
      </FormPanel>
    </Shell>
  );
}
