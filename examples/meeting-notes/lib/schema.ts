import { z } from "zod";

export const MeetingNotesSchema = z.object({
  title: z.string().describe("Short title, under 80 characters"),
  summary: z.string().describe("Neutral third-person summary, 3 to 6 sentences"),
  decisions: z
    .array(z.string())
    .describe(
      "Decisions that were made, one sentence each. Empty array if none. Do not include open questions or proposals nobody agreed to.",
    ),
  actionItems: z.array(
    z.object({
      task: z.string().describe("Short, imperative, self-contained"),
      owner: z.string().nullable().describe("Person named as responsible, or null"),
    }),
  ),
});

export type MeetingNotes = z.infer<typeof MeetingNotesSchema>;

export type ActionItem = {
  id: string;
  task: string;
  owner: string | null;
  done: boolean;
};

export type MeetingStatus = "transcribing" | "summarizing" | "ready" | "error";

export type Meeting = {
  id: string;
  createdAt: number;
  title: string;
  language: string;
  durationSec?: number;
  status: MeetingStatus;
  error?: string;
  transcript?: string;
  summary?: string;
  decisions: string[];
  actionItems: ActionItem[];
};
