"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, MicOff, Play, Square } from "lucide-react";
import { PageHeader } from "@/components/blocks/app-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { FormFooter } from "@/components/blocks/form-section";
import { ReadAlongLine, useReadAlong } from "@/components/read-along";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { audioContext, audioUnlocked, cartesiaClient, unlockAudio } from "@/lib/audio";
import { castVoices, isNarrator, voiceFor } from "@/lib/cast";
import { listenForChoice } from "@/lib/listen";
import { matchChoice } from "@/lib/match-choice";
import { narrateLive, replay, type Narration, type Timeline } from "@/lib/narrate";
import { getStory, saveStory } from "@/lib/store";
import { isFinished, NARRATOR, themeLabel, TONES, TOTAL_SCENES, type Scene, type SceneRecord, type Story } from "@/lib/story";

type Phase = "loading" | "missing" | "writing" | "reading" | "choosing" | "idle" | "end" | "error";

const softRed =
  "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive dark:border-destructive/40 dark:bg-destructive/15";

function phaseFor(s: Story): Phase {
  if (isFinished(s)) return "end";
  const last = s.scenes.at(-1);
  if (last && last.choices.length === 2 && last.chosen === undefined) return "choosing";
  return "idle";
}

async function postScene(s: Story): Promise<Scene> {
  let res: Response;
  try {
    res = await fetch("/api/scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hero: s.hero,
        themes: s.themes,
        tone: s.tone,
        title: s.title,
        history: s.scenes.map(({ lines, choices, chosen }) => ({ lines, choices, chosen })),
      }),
    });
  } catch {
    throw new Error("Could not reach the server");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not write the scene");
  return body as Scene;
}

export function StoryPlayer({ id }: { id: string }) {
  const [story, setStory] = useState<Story | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ scene: number; timeline: Timeline } | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [unclear, setUnclear] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);

  const storyRef = useRef<Story | null>(null);
  const narration = useRef<Narration | null>(null);
  const listener = useRef<{ stop(): void } | null>(null);
  const busy = useRef(false);

  const commit = useCallback(async (s: Story) => {
    storyRef.current = s;
    setStory(s);
    await saveStory(s);
  }, []);

  const stopListening = useCallback(() => {
    listener.current?.stop();
    listener.current = null;
    setListening(false);
  }, []);

  const stopReading = useCallback(() => {
    narration.current?.stop();
    narration.current = null;
  }, []);

  const startListening = useCallback(async () => {
    const s = storyRef.current;
    const scene = s?.scenes.at(-1);
    if (!s || !scene || scene.choices.length !== 2 || listener.current) return;
    setHeard("");
    setUnclear(false);
    setMicBlocked(false);
    try {
      await unlockAudio();
      const client = await cartesiaClient();
      setListening(true);
      listener.current = await listenForChoice(client, audioContext(), {
        onPartial: (t) => {
          setHeard(t);
          setUnclear(false);
        },
        onAnswer: (t, final) => {
          const pick = matchChoice(t, scene.choices);
          if (pick !== null) {
            void chooseRef.current(pick);
            return true;
          }
          if (final) {
            setHeard(t);
            setUnclear(true);
          }
          return false;
        },
      });
    } catch {
      listener.current = null;
      setListening(false);
      setMicBlocked(true);
    }
  }, []);

  const read = useCallback(
    async (index: number) => {
      const s = storyRef.current!;
      const scene = s.scenes[index]!;
      stopReading();
      stopListening();
      const ctx = audioContext();
      let n: Narration;
      if (scene.audio) {
        n = replay(ctx, scene.audio);
      } else {
        const client = await cartesiaClient();
        n = narrateLive(client, ctx, scene.lines, (speaker) => voiceFor(speaker, s.cast, s.narrator));
        void n.recorded
          .then((audio) => {
            const cur = storyRef.current;
            if (!audio || !cur) return;
            return commit({ ...cur, scenes: cur.scenes.map((sc, i) => (i === index ? { ...sc, audio } : sc)) });
          })
          .catch(() => {});
      }
      narration.current = n;
      setPlaying({ scene: index, timeline: n.timeline });
      setPhase("reading");
      try {
        await n.ended;
      } finally {
        if (narration.current === n) narration.current = null;
        setPlaying(null);
      }
      setPhase(phaseFor(storyRef.current!));
    },
    [commit, stopListening, stopReading],
  );

  const advance = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      await unlockAudio();
      let s = storyRef.current!;
      const last = s.scenes.at(-1);
      if (!last || last.chosen !== undefined) {
        setPhase("writing");
        const scene = await postScene(s);
        const record: SceneRecord = { lines: scene.lines, choices: scene.choices };
        s = {
          ...s,
          title: s.title || scene.title,
          cast: castVoices(s.cast, s.narrator, scene.lines),
          scenes: [...s.scenes, record],
        };
        await commit(s);
      }
      await read(s.scenes.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    } finally {
      busy.current = false;
    }
  }, [commit, read]);

  const choose = useCallback(
    async (pick: number) => {
      stopListening();
      const s = storyRef.current!;
      const scenes = s.scenes.map((sc, i) => (i === s.scenes.length - 1 ? { ...sc, chosen: pick } : sc));
      await commit({ ...s, scenes });
      await advance();
    },
    [advance, commit, stopListening],
  );
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  useEffect(() => {
    let live = true;
    void getStory(id).then((s) => {
      if (!live) return;
      if (!s) {
        setPhase("missing");
        return;
      }
      storyRef.current = s;
      setStory(s);
      if (s.scenes.length === 0 && audioUnlocked()) void advance();
      else setPhase(phaseFor(s));
    });
    return () => {
      live = false;
      narration.current?.stop();
      listener.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ctx = playing ? audioContext() : null;
  const playingLines = playing && story ? story.scenes[playing.scene]!.lines : EMPTY;
  const pos = useReadAlong(ctx, playing?.timeline ?? null, playingLines);

  if (phase === "missing") {
    return (
      <EmptyState
        title="This story is not in this browser"
        description="Stories are saved only in the browser that made them."
        action={
          <Button asChild variant="outline">
            <Link href="/">Make a story</Link>
          </Button>
        }
      />
    );
  }
  if (!story) return <Skeleton className="h-64 w-full rounded-xl" />;

  const themes = themeLabel(story.themes);
  const tone = TONES.find((t) => t.value === story.tone)?.label ?? "A";
  const last = story.scenes.at(-1);
  const needsReading = phase === "idle" && last && !last.audio;

  return (
    <>
      <PageHeader
        title={story.title || (story.hero ? `${story.hero}'s story` : "New story")}
        description={`${tone} story about ${themes.toLowerCase()}. You choose what happens next.`}
        actions={
          phase === "reading" ? (
            <Button variant="outline" className={softRed} onClick={stopReading}>
              <Square /> Stop
            </Button>
          ) : null
        }
      />

      {error ? (
        <Alert variant="destructive" className="mb-8">
          <AlertTitle>Could not finish</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="divide-y divide-border rounded-xl border border-border bg-card text-card-foreground shadow-xs">
        {story.scenes.map((scene, i) => (
          <SceneSection
            key={i}
            index={i}
            scene={scene}
            story={story}
            position={playing?.scene === i ? pos : null}
            canReplay={(Boolean(scene.audio) || i === story.scenes.length - 1) && phase !== "reading" && phase !== "writing"}
            onReplay={() => void read(i).catch(() => {})}
          />
        ))}

        {phase === "writing" ? <WritingSection n={story.scenes.length + 1} /> : null}

        {phase === "choosing" && last ? (
          <section className="flex flex-col gap-4 p-5 sm:p-6" aria-live="polite">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium leading-5">What happens next?</h2>
                <ListenStatus listening={listening} heard={heard} unclear={unclear} blocked={micBlocked} />
              </div>
              {!listening ? (
                <Button variant="ghost" size="sm" onClick={() => void startListening()}>
                  <Mic /> Answer out loud
                </Button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {last.choices.map((c, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="h-auto min-h-12 justify-start gap-3 py-3 text-left whitespace-normal"
                  onClick={() => void choose(i)}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {i + 1}
                  </span>
                  {c}
                </Button>
              ))}
            </div>
          </section>
        ) : null}

        {story.scenes.length === 0 && phase === "idle" ? (
          <FormFooter>
            <Button className="w-full sm:w-auto sm:min-w-40" onClick={() => void advance()}>
              <Play /> Start the story
            </Button>
          </FormFooter>
        ) : null}
        {needsReading || phase === "error" ? (
          <FormFooter>
            <Button className="w-full sm:w-auto sm:min-w-40" onClick={() => void advance()}>
              {phase === "error" ? "Try again" : `Read scene ${story.scenes.length}`}
            </Button>
          </FormFooter>
        ) : null}
        {phase === "end" ? (
          <FormFooter className="sm:justify-between">
            <p className="text-sm font-medium">The end.</p>
            <Button asChild className="w-full sm:w-auto sm:min-w-40">
              <Link href="/">Make another story</Link>
            </Button>
          </FormFooter>
        ) : null}
      </div>
    </>
  );
}

const EMPTY: never[] = [];

function SceneSection({
  index,
  scene,
  story,
  position,
  canReplay,
  onReplay,
}: {
  index: number;
  scene: SceneRecord;
  story: Story;
  position: { line: number; token: number } | null;
  canReplay: boolean;
  onReplay: () => void;
}) {
  const label = (speaker: string) => (isNarrator(speaker) ? NARRATOR : speaker);
  return (
    <section className="flex flex-col gap-5 p-5 sm:p-6" aria-label={`Scene ${index + 1}`}>
      <div className="flex min-h-8 items-center justify-between gap-4">
        <h2 className="text-sm font-medium leading-5">
          Scene {index + 1} of {TOTAL_SCENES}
        </h2>
        {canReplay ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Play scene ${index + 1}`} onClick={onReplay}>
            <Play />
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        {scene.lines.map((line, i) => (
          <ReadAlongLine
            key={i}
            line={line}
            speaker={label(line.speaker)}
            state={!position ? "after" : i < position.line ? "after" : i === position.line ? "active" : "before"}
            token={position?.line === i ? position.token : -1}
          />
        ))}
      </div>
      {scene.chosen !== undefined ? (
        <p className="flex items-center gap-2 text-[13px] leading-5 text-muted-foreground">
          <Check className="size-4 text-primary" aria-hidden />
          You chose: {scene.choices[scene.chosen]}
        </p>
      ) : null}
    </section>
  );
}

function WritingSection({ n }: { n: number }) {
  return (
    <section className="flex flex-col gap-4 p-5 sm:p-6" aria-live="polite">
      <p className="flex items-center gap-2 text-[13px] leading-5 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Writing scene {n} of {TOTAL_SCENES}
      </p>
      <Skeleton className="h-6 w-11/12" />
      <Skeleton className="h-6 w-4/5" />
      <Skeleton className="h-6 w-2/3" />
    </section>
  );
}

function ListenStatus({ listening, heard, unclear, blocked }: { listening: boolean; heard: string; unclear: boolean; blocked: boolean }) {
  if (blocked) {
    return (
      <p className="flex items-center gap-2 text-[13px] leading-5 text-muted-foreground">
        <MicOff className="size-4" aria-hidden /> The microphone is off. Tap a choice.
      </p>
    );
  }
  if (!listening) {
    return (
      <p className="text-[13px] leading-5 text-muted-foreground">
        Tap a choice. To say it instead, press Answer out loud. Your voice then streams to Cartesia for transcription.
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-[13px] leading-5 text-muted-foreground">
      <span className="relative flex size-2.5" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
      </span>
      {unclear ? "I did not catch that. Say it again, or tap a choice." : "Listening. Say a choice, or tap it."}
      {heard ? <span className="text-foreground">&ldquo;{heard}&rdquo;</span> : null}
    </p>
  );
}
