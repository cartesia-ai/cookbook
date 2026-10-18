"use client";

import { ChoiceChips } from "@/components/blocks/choice-chips";
import { Field, FieldGrid } from "@/components/blocks/field";
import { FormFooter, FormPanel, FormSection } from "@/components/blocks/form-section";
import { Steps } from "@/components/blocks/steps";
import { Player } from "@/components/player";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { defaultOptions, LANGUAGES, LENGTHS, STYLE_PRESETS, type LanguageName, type LengthName } from "@/lib/config";
import type { PodcastScript } from "@/lib/types";

type Phase = "idle" | "script" | "audio" | "done";
type Mode = "url" | "text";

const STEPS = ["Reading the article", "Writing the script", "Recording the voices"];
const TONES = STYLE_PRESETS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `The request failed (HTTP ${res.status}).`;
  } catch {
    return `The request failed (HTTP ${res.status}).`;
  }
}

export function Studio() {
  const base = defaultOptions();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [hostAName, setHostAName] = useState(base.hostAName);
  const [hostBName, setHostBName] = useState(base.hostBName);
  const [length, setLength] = useState<LengthName>(base.length);
  const [language, setLanguage] = useState<LanguageName>(base.outputLanguage);
  const [styles, setStyles] = useState<string[]>(base.conversationStyle);
  const [instructions, setInstructions] = useState("");
  const [showMore, setShowMore] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<PodcastScript | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [starts, setStarts] = useState<number[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  function replaceAudioUrl(next: string | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setAudioUrl(next);
  }

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const busy = phase === "script" || phase === "audio";
  const input = mode === "url" ? url.trim() : text.trim();

  async function run() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setScript(null);
    setStarts(null);
    setTruncated(false);
    replaceAudioUrl(null);
    setPhase("script");

    const options = {
      ...base,
      hostAName: hostAName.trim() || base.hostAName,
      hostBName: hostBName.trim() || base.hostBName,
      length,
      outputLanguage: language,
      conversationStyle: styles,
      userInstructions: instructions,
    };

    let haveScript = false;
    try {
      const scriptRes = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [mode]: input, options }),
        signal: controller.signal,
      });
      if (!scriptRes.ok) throw new Error(await readError(scriptRes));
      const data = (await scriptRes.json()) as { script: PodcastScript; truncated: boolean };
      haveScript = true;
      setScript(data.script);
      setTruncated(data.truncated);
      setPhase("audio");

      const audioRes = await fetch("/api/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: data.script, options }),
        signal: controller.signal,
      });
      if (!audioRes.ok) throw new Error(await readError(audioRes));
      const lineStarts = JSON.parse(audioRes.headers.get("X-Line-Starts") ?? "[]") as number[];
      const blob = await audioRes.blob();
      setStarts(lineStarts);
      replaceAudioUrl(URL.createObjectURL(blob));
      setPhase("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message = (err as Error).message || "Something went wrong.";
      setError(message);
      setPhase(haveScript ? "done" : "idle");
    }
  }

  const stepIndex = phase === "audio" ? 2 : 1;
  const names = { A: hostAName.trim() || base.hostAName, B: hostBName.trim() || base.hostBName };

  return (
    <div className="flex flex-col gap-10">
      <FormPanel>
        <FormSection
          title="Source"
          description="Link to an article, or paste its text."
          aside={
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList>
                <TabsTrigger value="url">Link</TabsTrigger>
                <TabsTrigger value="text">Paste text</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          {mode === "url" ? (
            <Field label="Article link" htmlFor="article-url" hint="Some pages load their text with JavaScript. Paste the text for those.">
              <Input id="article-url" type="url" inputMode="url" placeholder="https://example.com/article" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          ) : (
            <Field label="Article text" htmlFor="article-text">
              <Textarea id="article-text" rows={8} placeholder="Paste the article text" value={text} onChange={(e) => setText(e.target.value)} className="max-h-80" />
            </Field>
          )}
        </FormSection>

        <FormSection title="Hosts" description="Host A leads the conversation. Host B asks the questions.">
          <FieldGrid>
            <Field label="Host A" htmlFor="host-a">
              <Input id="host-a" value={hostAName} maxLength={40} onChange={(e) => setHostAName(e.target.value)} />
            </Field>
            <Field label="Host B" htmlFor="host-b">
              <Input id="host-b" value={hostBName} maxLength={40} onChange={(e) => setHostBName(e.target.value)} />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="Format">
          <FieldGrid>
            <Field label="Length" htmlFor="length">
              <Select value={length} onValueChange={(v) => setLength(v as LengthName)}>
                <SelectTrigger id="length" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LENGTHS) as LengthName[]).map((k) => (
                    <SelectItem key={k} value={k}>{LENGTHS[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Language" htmlFor="language">
              <Select value={language} onValueChange={(v) => setLanguage(v as LanguageName)}>
                <SelectTrigger id="language" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LANGUAGES) as LanguageName[]).map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGrid>
          <Field label={<span id="tone-label">Tone</span>}>
            <ChoiceChips aria-labelledby="tone-label" options={TONES} value={styles} onValueChange={setStyles} />
          </Field>
        </FormSection>

        {showMore ? (
          <FormSection
            title="Extra instructions"
            aside={
              <Button type="button" variant="ghost" size="icon-sm" className="-my-1.5" aria-label="Hide extra instructions" onClick={() => setShowMore(false)}>
                <X />
              </Button>
            }
          >
            <Textarea rows={3} maxLength={1000} placeholder="For example: explain terms for beginners, or end with three takeaways." value={instructions} onChange={(e) => setInstructions(e.target.value)} aria-label="Extra instructions" />
          </FormSection>
        ) : null}

        <FormFooter>
          {showMore ? null : (
            <Button type="button" variant="ghost" onClick={() => setShowMore(true)}>
              <Plus aria-hidden /> Extra instructions
            </Button>
          )}
          <Button className="sm:min-w-40" disabled={busy || input.length === 0} onClick={run}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Make podcast
          </Button>
        </FormFooter>
      </FormPanel>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not finish</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {busy ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Progress</h2>
          <div className="rounded-xl border border-border bg-card p-5">
            <Steps steps={STEPS} current={stepIndex} />
          </div>
        </section>
      ) : null}

      {script ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Episode</h2>
          <Player
            title={script.title}
            note={truncated ? "The article was long, so the episode covers the first part." : null}
            lines={script.lines}
            names={names}
            audioUrl={audioUrl}
            starts={starts}
            fileName="episode.wav"
          />
        </section>
      ) : null}
    </div>
  );
}
