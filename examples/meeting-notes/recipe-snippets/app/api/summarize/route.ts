import { generateText, Output } from 'ai';
import { z } from 'zod';

const MeetingNotes = z.object({
  title: z.string().describe('Short title, under 80 characters'),
  summary: z.string().describe('Neutral third-person summary, 3 to 6 sentences'),
  decisions: z
    .array(z.string())
    .describe('Decisions that were made, one sentence each. Empty array if none.'),
  actionItems: z.array(
    z.object({
      task: z.string().describe('Short, imperative, self-contained'),
      owner: z.string().nullable().describe('Person named as responsible, or null'),
    }),
  ),
});

export async function POST(req: Request) {
  const { transcript } = await req.json();
  if (typeof transcript !== 'string' || !transcript.trim()) {
    return Response.json({ error: 'The transcript is empty' }, { status: 400 });
  }

  const { output } = await generateText({
    model: process.env.LLM_MODEL!,
    instructions:
      'Turn the meeting transcript into notes. Only use what the transcript says. ' +
      'Never invent owners or decisions. Open questions are not decisions.',
    prompt: transcript,
    output: Output.object({ schema: MeetingNotes }),
  });

  return Response.json(output);
}
