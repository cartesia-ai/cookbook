import { Headphones } from "lucide-react";
import { LANGUAGES, type LanguageCode } from "../lib/languages";
import { FieldGrid } from "@/components/blocks/field";
import { FormFooter, FormPanel, FormSection } from "@/components/blocks/form-section";
import { PageHeader } from "@/components/blocks/app-shell";
import { Button } from "@/components/ui/button";
import { LanguageSelect } from "./language-select";
import { Shell } from "./shell";

export function Splash({
  native,
  target,
  onNative,
  onTarget,
  onContinue,
}: {
  native: LanguageCode;
  target: LanguageCode;
  onNative: (c: LanguageCode) => void;
  onTarget: (c: LanguageCode) => void;
  onContinue: () => void;
}) {
  const same = native === target;
  const setNative = (c: LanguageCode) => (c === target ? (onTarget(native), onNative(c)) : onNative(c));
  const setTarget = (c: LanguageCode) => (c === native ? (onNative(target), onTarget(c)) : onTarget(c));
  return (
    <Shell width="narrow">
      <PageHeader
        title="Practice a language out loud"
        description="Short role plays with a voice partner. After every line you say, a side panel shows what to fix."
      />
      <FormPanel>
        <FormSection title="Languages" description={`Your partner hears and speaks ${LANGUAGES.map((l) => l.name).join(", ").replace(/, ([^,]*)$/, " and $1")}.`}>
          <FieldGrid>
            <LanguageSelect id="native" label="I speak" value={native} onChange={setNative} />
            <LanguageSelect id="target" label="I'm learning" value={target} onChange={setTarget} />
          </FieldGrid>
        </FormSection>
        <FormFooter>
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground sm:mr-auto sm:justify-start">
            <Headphones className="size-4 shrink-0" aria-hidden />
            You need a microphone. Headphones work best.
          </p>
          <Button className="sm:min-w-40" onClick={onContinue} disabled={same}>
            Choose a mission
          </Button>
        </FormFooter>
      </FormPanel>
    </Shell>
  );
}
