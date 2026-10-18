"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentMessage } from "@/lib/agents-web/react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LanguageCode } from "@/lib/languages";

function Dots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Listening to you">
      <span className="sp-dot size-1.5 rounded-full bg-current" />
      <span className="sp-dot size-1.5 rounded-full bg-current" />
      <span className="sp-dot size-1.5 rounded-full bg-current" />
    </span>
  );
}

function Bubble({ mine, children }: { mine: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "w-fit max-w-[80%] overflow-hidden rounded-xl px-3 py-2 text-sm leading-relaxed wrap-break-word",
        mine ? "self-end bg-accent text-accent-foreground" : "self-start bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </div>
  );
}

export function Transcript({ messages, userSpeaking, lang }: { messages: AgentMessage[]; userSpeaking: boolean; lang: LanguageCode }) {
  const last = messages[messages.length - 1];
  const showDots = userSpeaking && !(last && last.role === "user" && !last.final && last.text);
  const viewport = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const stick = useRef(true);

  function onScroll() {
    const el = viewport.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stick.current = near;
    setAtBottom(near);
  }

  function toBottom() {
    const el = viewport.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }

  useEffect(() => {
    if (stick.current) toBottom();
  }, [messages, showDots]);

  return (
    <div className="relative h-full">
      <div ref={viewport} onScroll={onScroll} className="h-full overflow-y-auto">
        <div role="log" aria-label="Conversation" lang={lang} className="flex flex-col gap-3 px-4 py-4">
          {messages.map((m) => {
            const mine = m.role === "user";
            const pending = !m.final && m.text === "";
            return (
              <div key={m.turn} className="flex flex-col gap-1">
                <Bubble mine={mine}>{pending ? <Dots /> : m.text}</Bubble>
                {m.interrupted ? (
                  <span className={cn("text-xs italic text-muted-foreground", mine ? "self-end" : "self-start px-3")}>interrupted</span>
                ) : null}
              </div>
            );
          })}
          {showDots ? (
            <div key="user-listening" className="flex flex-col">
              <Bubble mine>
                <Dots />
              </Bubble>
            </div>
          ) : null}
        </div>
      </div>
      {!atBottom ? (
        <Button
          variant="outline"
          size="icon-sm"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
          aria-label="Scroll to latest"
          onClick={() => {
            stick.current = true;
            toBottom();
          }}
        >
          <ChevronDown />
        </Button>
      ) : null}
    </div>
  );
}
