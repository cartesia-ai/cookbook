"use client";

import { ActionItemRow } from "@/components/action-item-row";
import { FormPanel, FormSection } from "@/components/blocks/form-section";
import { updateMeeting } from "@/lib/store";
import type { Meeting } from "@/lib/schema";

function toggleItem(meetingId: string, itemId: string, done: boolean) {
  return updateMeeting(meetingId, (m) => ({
    ...m,
    actionItems: m.actionItems.map((a) => (a.id === itemId ? { ...a, done } : a)),
  }));
}

export function NotesView({ meeting }: { meeting: Meeting }) {
  const open = meeting.actionItems.filter((a) => !a.done).length;
  return (
    <FormPanel>
      <FormSection title="Summary">
        <p className="text-sm leading-6 text-pretty">{meeting.summary}</p>
      </FormSection>

      <FormSection title="Decisions">
        {meeting.decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No decisions were recorded.</p>
        ) : (
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6 marker:text-muted-foreground">
            {meeting.decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection
        title="Action items"
        description={meeting.actionItems.length > 0 ? `${open} of ${meeting.actionItems.length} open` : undefined}
        className="pb-3 sm:pb-3"
      >
        {meeting.actionItems.length === 0 ? (
          <p className="pb-2 text-sm text-muted-foreground sm:pb-3">No action items.</p>
        ) : (
          <div className="-mx-5 -mt-1 divide-y divide-border sm:-mx-6">
            {meeting.actionItems.map((a) => (
              <ActionItemRow
                key={a.id}
                item={a}
                className="sm:px-6"
                onToggle={(done) => void toggleItem(meeting.id, a.id, done)}
              />
            ))}
          </div>
        )}
      </FormSection>
    </FormPanel>
  );
}

export { toggleItem };
