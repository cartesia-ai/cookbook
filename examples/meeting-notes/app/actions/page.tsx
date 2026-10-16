"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/blocks/app-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionItemRow } from "@/components/action-item-row";
import { toggleItem } from "@/components/notes-view";
import { formatDate } from "@/lib/format";
import { useMeetings } from "@/lib/store";

export default function ActionsPage() {
  const meetings = useMeetings();
  const [showDone, setShowDone] = useState(false);

  const groups = (meetings ?? [])
    .map((m) => ({ meeting: m, items: m.actionItems.filter((a) => showDone || !a.done) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="Action items"
        description="Open items from every meeting. Check one off when it is done."
        actions={
          <Tabs value={showDone ? "all" : "open"} onValueChange={(v) => setShowDone(v === "all")}>
            <TabsList aria-label="Which items to show">
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {!meetings ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title={showDone ? "No action items yet" : "Nothing to do"}
          description="Action items from your meetings show up here."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(({ meeting, items }) => {
            const open = meeting.actionItems.filter((a) => !a.done).length;
            return (
              <section key={meeting.id} aria-labelledby={`group-${meeting.id}`} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 id={`group-${meeting.id}`} className="min-w-0 truncate text-sm font-medium">
                    <Link href={`/meeting/${meeting.id}`} className="underline-offset-4 hover:underline">
                      {meeting.title}
                    </Link>
                  </h2>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(meeting.createdAt)} · {open} open
                  </span>
                </div>
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                  {items.map((a) => (
                    <ActionItemRow key={a.id} item={a} onToggle={(done) => void toggleItem(meeting.id, a.id, done)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
