import { ArrowLeft, ChevronRight, UserRound } from "lucide-react";
import { PageHeader } from "@/components/blocks/app-shell";
import { FormPanel, FormSection } from "@/components/blocks/form-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { languageName, type LanguageCode } from "@/lib/languages";
import { DIFFICULTIES, MISSIONS, type Mission } from "@/lib/missions";
import { isMode, MODE_COPY, MODES, type Mode } from "@/lib/modes";
import { Shell } from "./shell";

function ModeTabs({ mode, onMode, className }: { mode: Mode; onMode: (m: Mode) => void; className?: string }) {
  return (
    <Tabs value={mode} onValueChange={(v) => isMode(v) && onMode(v)} className={className}>
      <TabsList className="w-full sm:w-auto">
        {MODES.map((m) => (
          <TabsTrigger key={m} value={m}>
            {MODE_COPY[m].label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function MissionPicker({
  target,
  native,
  mode,
  onMode,
  onPick,
  onBack,
  error,
}: {
  target: LanguageCode;
  native: LanguageCode;
  mode: Mode;
  onMode: (m: Mode) => void;
  onPick: (m: Mission) => void;
  onBack: () => void;
  error: string | null;
}) {
  return (
    <Shell>
      <PageHeader
        title="Choose a mission"
        description={`Speak ${languageName(target)}, with help in ${languageName(native)}.`}
        actions={
          <Button variant="outline" onClick={onBack} aria-label="Back to languages">
            <ArrowLeft /> Languages
          </Button>
        }
      />

      <div className="flex flex-col gap-10">
        <FormPanel>
          <FormSection title="Mode" description={MODE_COPY[mode].blurb} aside={<ModeTabs mode={mode} onMode={onMode} className="hidden sm:flex" />}>
            <ModeTabs mode={mode} onMode={onMode} className="sm:hidden" />
          </FormSection>
        </FormPanel>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not start the session</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {DIFFICULTIES.map((d) => {
          const list = MISSIONS.filter((m) => m.difficulty === d);
          return (
            <section key={d} className="flex flex-col gap-4" aria-label={`${d} missions`}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-medium">{d}</h2>
                <span className="text-xs text-muted-foreground">
                  {list.length} {list.length === 1 ? "mission" : "missions"}
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {list.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onPick(m)}
                      className="group flex h-full min-h-28 w-full flex-col gap-1 rounded-xl border border-border bg-card p-4 text-left text-card-foreground shadow-xs transition-colors outline-none hover:border-primary/40 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span className="flex items-center justify-between gap-3 text-sm font-medium">
                        {m.title}
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </span>
                      <span className="text-[13px] leading-5 text-muted-foreground">{m.desc}</span>
                      <span className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-muted-foreground">
                        <UserRound aria-hidden className="size-3.5" />
                        {m.target_role}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
