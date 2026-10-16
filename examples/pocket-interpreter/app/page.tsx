"use client";

import { useEffect, useState } from "react";
import { AppMain, PageHeader } from "@/components/blocks/app-shell";
import { Conversation } from "@/components/conversation";
import { SiteHeader } from "@/components/site-header";
import { SetupBanner } from "@/components/setup-banner";
import { SetupForm, type Layout } from "@/components/setup-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isLang, type Lang } from "@/lib/languages";
import { useInterpreter } from "@/lib/use-interpreter";

const PREFS = "pocket-interpreter:prefs";

type Prefs = { pair: [Lang, Lang]; layout: Layout; large: boolean };

function loadPrefs(): Prefs | null {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? "null") as Prefs | null;
    if (p && isLang(p.pair?.[0]) && isLang(p.pair?.[1]) && p.pair[0] !== p.pair[1]) return p;
  } catch {
    // private mode or bad JSON: use the defaults
  }
  return null;
}

export default function Home() {
  const [pair, setPair] = useState<[Lang, Lang]>(["en", "es"]);
  const [layout, setLayout] = useState<Layout>("upright");
  const [large, setLarge] = useState(false);
  const interpreter = useInterpreter();

  useEffect(() => {
    const p = loadPrefs();
    if (!p) return;
    setPair(p.pair);
    setLayout(p.layout === "flipped" ? "flipped" : "upright");
    setLarge(Boolean(p.large));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ pair, layout, large }));
    } catch {
      // not saved, that is fine
    }
  }, [pair, layout, large]);

  if (interpreter.live && interpreter.phase !== null) {
    return (
      <>
        <SiteHeader width="wide" />
        <Conversation
        pair={pair}
        turns={interpreter.turns}
        phase={interpreter.phase}
        caption={interpreter.caption}
        flipped={layout === "flipped"}
        onFlip={() => setLayout((l) => (l === "flipped" ? "upright" : "flipped"))}
        large={large}
        onLarge={() => setLarge((v) => !v)}
        onEnd={() => void interpreter.stop()}
        />
      </>
    );
  }

  return (
    <>
      <SiteHeader width="narrow" />
      <AppMain width="narrow">
      <PageHeader
        title="Talk across two languages"
        description="Two people, one phone or laptop. Each of you speaks your own language and hears the other in it, voiced by Sonic 3.6."
      />
      <SetupBanner />
      {interpreter.error ? (
        <Alert variant="destructive" className="mb-8">
          <AlertTitle>Could not keep going</AlertTitle>
          <AlertDescription>{interpreter.error}</AlertDescription>
        </Alert>
      ) : null}
      <SetupForm
        pair={pair}
        onPairChange={setPair}
        layout={layout}
        onLayoutChange={setLayout}
        onStart={() => void interpreter.start(pair)}
        starting={interpreter.live}
      />
      </AppMain>
    </>
  );
}
