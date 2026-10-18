"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChoiceChips } from "@/components/blocks/choice-chips";
import { Field, FieldGrid } from "@/components/blocks/field";
import { FormFooter, FormPanel, FormSection } from "@/components/blocks/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { unlockAudio } from "@/lib/audio";
import { cleanHeroName } from "@/lib/safety";
import { saveStory } from "@/lib/store";
import { NARRATORS, THEMES, TONES, VOICES, type ThemeValue, type Tone, type VoiceKey } from "@/lib/story";

export function StoryForm() {
  const router = useRouter();
  const [hero, setHero] = useState("");
  const [tone, setTone] = useState<Tone>("adventure");
  const [themes, setThemes] = useState<string[]>(["space"]);
  const [narrator, setNarrator] = useState<VoiceKey>("marian");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const name = hero.trim() ? cleanHeroName(hero) : "";
  const nameError = touched && name === null ? "Letters only, up to 24 characters." : undefined;

  const pickThemes = (next: string[]) => setThemes(next.length > 2 ? next.slice(-2) : next);

  async function start() {
    setTouched(true);
    if (name === null || themes.length === 0) return;
    setBusy(true);
    await unlockAudio();
    const id = crypto.randomUUID();
    await saveStory({
      id,
      createdAt: Date.now(),
      hero: name,
      themes: themes as ThemeValue[],
      tone,
      narrator,
      title: "",
      cast: {},
      scenes: [],
    });
    router.push(`/story/${id}`);
  }

  return (
    <FormPanel>
      <FormSection title="Hero" description="Name the main character, or leave it blank and the storyteller picks one.">
        <FieldGrid>
          <Field label="Character name" htmlFor="hero" error={nameError} hint="Optional. Make one up.">
            <Input
              id="hero"
              value={hero}
              maxLength={24}
              autoComplete="off"
              placeholder="Captain Juniper"
              aria-invalid={Boolean(nameError)}
              onChange={(e) => setHero(e.target.value)}
              onBlur={() => hero && setTouched(true)}
            />
          </Field>
          <Field label={<span id="tone-label">Tone</span>}>
            <Tabs value={tone} onValueChange={(v) => setTone(v as Tone)}>
              <TabsList aria-labelledby="tone-label" className="h-9 w-full">
                {TONES.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="Story">
        <Field label={<span id="theme-label">Theme</span>} hint="Pick one or two." error={touched && themes.length === 0 ? "Pick a theme." : undefined}>
          <ChoiceChips
            aria-labelledby="theme-label"
            options={THEMES.map((t) => ({ value: t.value, label: t.label }))}
            value={themes}
            onValueChange={pickThemes}
          />
        </Field>
        <FieldGrid>
          <Field label="Narrator" htmlFor="narrator" hint="Characters get their own voices.">
            <Select value={narrator} onValueChange={(v) => setNarrator(v as VoiceKey)}>
              <SelectTrigger id="narrator" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NARRATORS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {VOICES[k].name}, {VOICES[k].hint.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGrid>
      </FormSection>

      <FormFooter>
        <p className="text-[13px] leading-5 text-muted-foreground sm:mr-auto">
          Three short scenes, about three minutes. Your settings and choices go to the AI model that writes the story. Stories
          are saved in this browser.
        </p>
        <Button className="sm:min-w-40" onClick={start} disabled={busy}>
          Start the story
        </Button>
      </FormFooter>
    </FormPanel>
  );
}
