"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Health = { cartesia: boolean; llm: boolean; moderation: boolean };

export function SetupBanner() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: Health) => live && setHealth(h))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!health || (health.cartesia && health.llm && health.moderation)) return null;
  return (
    <Alert className="mb-8">
      <Info aria-hidden />
      <AlertTitle>Finish setup</AlertTitle>
      <AlertDescription>
        {!health.cartesia && (
          <p>
            Add <code>CARTESIA_API_KEY</code> to <code>.env.local</code> so Sonic can read and Ink can listen.
          </p>
        )}
        {!health.llm && (
          <p>
            Set <code>LLM_MODEL</code> (for example <code>openai/gpt-5.4-mini</code>) and the matching provider key to write
            the story.
          </p>
        )}
        {!health.moderation && (
          <p>
            Add <code>OPENAI_API_KEY</code> to check names and scenes with OpenAI&apos;s free moderation endpoint. Without
            it, only the word list in <code>lib/safety.ts</code> runs.
          </p>
        )}
        <p>Restart the dev server after editing the file.</p>
      </AlertDescription>
    </Alert>
  );
}
