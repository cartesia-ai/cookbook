"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Health = { cartesia: boolean; llm: boolean };

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

  if (!health || (health.cartesia && health.llm)) return null;

  return (
    <Alert className="mb-8">
      <Info aria-hidden />
      <AlertTitle>Finish setup</AlertTitle>
      <AlertDescription>
        {!health.cartesia && (
          <p>
            Add your Cartesia key to <code>.env.local</code> to transcribe audio. <code>.env.example</code> lists the name.
          </p>
        )}
        {!health.llm && (
          <p>
            Set <code>LLM_MODEL</code> (for example <code>openai/gpt-5.4-mini</code>) and the matching provider key to
            write the notes.
          </p>
        )}
        <p>Restart the dev server after editing the file.</p>
      </AlertDescription>
    </Alert>
  );
}
