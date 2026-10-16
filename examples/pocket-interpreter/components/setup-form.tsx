"use client";

import { ArrowLeftRight, Mic } from "lucide-react";
import { Field } from "@/components/blocks/field";
import { FormFooter, FormPanel, FormSection } from "@/components/blocks/form-section";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { englishName, LANGS, nativeName, VOICES, type Lang } from "@/lib/languages";

export type Layout = "upright" | "flipped";

function LanguageSelect({ id, value, onChange }: { id: string; value: Lang; onChange: (l: Lang) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Lang)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGS.map((l) => (
          <SelectItem key={l} value={l}>
            {englishName(l)}
            {l !== "en" ? <span className="text-muted-foreground">{nativeName(l)}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SetupForm({
  pair,
  onPairChange,
  layout,
  onLayoutChange,
  onStart,
  starting,
}: {
  pair: [Lang, Lang];
  onPairChange: (pair: [Lang, Lang]) => void;
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  onStart: () => void;
  starting: boolean;
}) {
  const [a, b] = pair;
  const setA = (l: Lang) => onPairChange(l === b ? [l, a] : [l, b]);
  const setB = (l: Lang) => onPairChange(l === a ? [b, l] : [a, l]);

  return (
    <FormPanel>
      <FormSection title="Languages" description="Ink 2 hears both of you on one microphone and works out who spoke.">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-2">
          <Field label="You speak" htmlFor="lang-a" hint={`You hear them in ${VOICES[a].name}'s voice`}>
            <LanguageSelect id="lang-a" value={a} onChange={setA} />
          </Field>
          <Button
            variant="ghost"
            size="icon"
            className="hidden self-start sm:mt-[26px] sm:inline-flex"
            aria-label="Swap languages"
            onClick={() => onPairChange([b, a])}
          >
            <ArrowLeftRight />
          </Button>
          <Field label="They speak" htmlFor="lang-b" hint={`They hear you in ${VOICES[b].name}'s voice`}>
            <LanguageSelect id="lang-b" value={b} onChange={setB} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Their side"
        description={
          layout === "flipped"
            ? "Upside down, for a phone lying flat between you."
            : "Upright, for sitting side by side."
        }
        aside={
          <Tabs value={layout} onValueChange={(v) => onLayoutChange(v as Layout)}>
            <TabsList>
              <TabsTrigger value="upright">Upright</TabsTrigger>
              <TabsTrigger value="flipped">Face to face</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        <p className="text-[13px] leading-5 text-muted-foreground">
          The microphone pauses while a translation plays, so the app never translates itself. You can flip the layout
          during the conversation too.
        </p>
      </FormSection>

      <FormFooter>
        <Button className="sm:min-w-40" onClick={onStart} disabled={starting}>
          <Mic /> {starting ? "Starting" : "Start talking"}
        </Button>
      </FormFooter>
    </FormPanel>
  );
}
