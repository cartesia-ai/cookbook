"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  turn: number;
  role: "user" | "assistant";
  text: string;
  final: boolean;
  interrupted?: boolean;
}

function Dots() {
  return (
    <span className="inline-flex h-6 items-center gap-1" aria-label="Listening to you">
      <span className="vc-dot size-1.5 rounded-full bg-current" />
      <span className="vc-dot size-1.5 rounded-full bg-current" />
      <span className="vc-dot size-1.5 rounded-full bg-current" />
    </span>
  );
}

function Turn({
  mine,
  label,
  interrupted,
  children,
}: {
  mine: boolean;
  label: boolean;
  interrupted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex max-w-[85%] min-w-0 flex-col gap-1.5 sm:max-w-[75%]", mine ? "items-end self-end" : "items-start self-start")}>
      {label ? <span className="text-xs font-medium text-muted-foreground">{mine ? "You" : "Agent"}</span> : null}
      <div
        className={cn(
          "w-fit min-w-0 rounded-2xl px-3.5 py-2 text-sm leading-6 wrap-break-word",
          mine ? "rounded-tr-md bg-accent text-accent-foreground" : "rounded-tl-md bg-secondary text-foreground",
        )}
      >
        {children}
      </div>
      {interrupted ? <span className="text-xs text-muted-foreground">interrupted</span> : null}
    </div>
  );
}

export function Transcript({
  messages,
  userSpeaking,
  empty,
}: {
  messages: ChatMessage[];
  userSpeaking: boolean;
  empty?: React.ReactNode;
}) {
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
    if (!el) return;
    stick.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight });
  }

  useEffect(() => {
    const el = viewport.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight });
  }, [messages, showDots]);

  const isEmpty = messages.length === 0 && !showDots;

  return (
    <div className="relative h-full">
      <div ref={viewport} onScroll={onScroll} className="h-full overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem)]">
        <div role="log" aria-label="Conversation" className="flex min-h-full flex-col justify-end gap-4 p-5 sm:p-6">
          {isEmpty ? empty : null}
          {messages.map((m, i) => {
            const mine = m.role === "user";
            const pending = !m.final && m.text === "";
            return (
              <Turn key={m.turn} mine={mine} label={messages[i - 1]?.role !== m.role} interrupted={m.interrupted}>
                {pending ? <Dots /> : m.text}
                {!m.final && !pending && !mine ? (
                  <span aria-hidden className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-current" />
                ) : null}
              </Turn>
            );
          })}
          {showDots ? (
            <Turn mine label={last?.role !== "user"}>
              <Dots />
            </Turn>
          ) : null}
        </div>
      </div>
      {!atBottom ? (
        <Button
          variant="outline"
          aria-label="Scroll to latest message"
          onClick={toBottom}
          size="icon-sm"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full"
        >
          <ArrowDown />
        </Button>
      ) : null}
    </div>
  );
}
