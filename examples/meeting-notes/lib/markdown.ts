import type { Meeting } from "@/lib/schema";

export function meetingToMarkdown(m: Meeting): string {
  const lines: string[] = [`# ${m.title}`, ""];
  lines.push(`_${new Date(m.createdAt).toISOString().slice(0, 10)}_`, "");
  if (m.summary) lines.push("## Summary", "", m.summary, "");
  if (m.decisions.length > 0) {
    lines.push("## Decisions", "", ...m.decisions.map((d) => `- ${d}`), "");
  }
  if (m.actionItems.length > 0) {
    lines.push(
      "## Action items",
      "",
      ...m.actionItems.map((a) => `- [${a.done ? "x" : " "}] ${a.task}${a.owner ? ` (${a.owner})` : ""}`),
      "",
    );
  }
  if (m.transcript) lines.push("## Transcript", "", m.transcript, "");
  return lines.join("\n").trimEnd() + "\n";
}
