export const CARTESIA_VERSION = '2026-08-14';
export const DEFAULT_MODEL_ID = 'gpt-4.1';
export const DEFAULT_VOICE_ID = 'e07c00bc-4134-4eae-9ea4-1a55fb45746b';

export const SEARCH_TOOL = {
  type: 'client',
  name: 'search_docs',
  description:
    'Searches this documentation site. Call it before answering any question about the product, with a short search query in English. Returns the best matching sections, each with a source_id.',
  pre_tool_speech: 'auto',
  execution_mode: 'immediate',
  expects_response: true,
  response_timeout_secs: 10,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'A short search query, for example "client tool result size limit".' },
    },
    required: ['query'],
  },
} as const;

export const SOURCE_TOOL = {
  type: 'client',
  name: 'show_source',
  description:
    'Required after every search_docs call you answer from. Scrolls the page to that section and shows it as a source. Call it once, before you speak the answer, with the source_id of the result you used most.',
  pre_tool_speech: 'off',
  execution_mode: 'async',
  expects_response: false,
  parameters: {
    type: 'object',
    properties: {
      source_id: { type: 'string', description: 'The source_id of a search_docs result.' },
    },
    required: ['source_id'],
  },
} as const;

export const INSTRUCTIONS = `# Identity
You are the voice assistant on a documentation website. Visitors talk to you while they read the docs.

# How to answer
Every answer about the product takes the same three steps, in this order, including follow-up questions on a topic you already covered:
1. Call search_docs with a short query.
2. Call show_source with the source_id of the result you rely on most. Prefer a result with on_this_page set to true when it answers the question.
3. Speak the answer, using only what the results say.

- Never skip step 2 when you answer from the results. Never mention it either: the page scrolls by itself, so do not say you are showing, opening or highlighting anything.
- If the results do not cover the question, skip show_source, say you could not find it in the docs and suggest a related topic they cover. Never guess at APIs, limits or values.
- Keep answers to two or three short spoken sentences. Offer to go deeper instead of listing everything. Do not open with filler such as "Perfect" or "I found it".

# Speaking rules
- This is speech. No markdown, backticks, lists, code blocks, URLs or URL paths. Say code names in plain words: "the request headers field", not request_headers or api_schema.request_headers, and "the client tool result event", not client_tool_result.
- Read numbers naturally, for example "four thousand ninety six bytes".
- Reply in the language the visitor speaks.

# Limits
- Only discuss these docs and the product they describe. Politely decline anything else.`;

export const INITIAL_MESSAGE = 'Hi! Ask me anything about these docs.';

export function agentBody(env: Record<string, string | undefined>, toolIds: string[]) {
  return {
    name: env.AGENT_NAME || 'Docs voice widget',
    description: 'Created by examples/docs-voice-widget in the Cartesia cookbook',
    config: {
      instructions: INSTRUCTIONS,
      initial_message: INITIAL_MESSAGE,
      model: { id: env.AGENT_MODEL_ID || DEFAULT_MODEL_ID, temperature: 0.3 },
      language: { primary: env.AGENT_LANGUAGE || 'en' },
      audio: {
        input: { noise_suppression: 'auto' },
        output: { voice_id: env.CARTESIA_VOICE_ID || DEFAULT_VOICE_ID },
      },
      turn: { inactivity_check_in_secs: 20, inactivity_end_call_secs: 60 },
      tools: toolIds.map((id) => ({ id })),
      system_tools: { end_call: { pre_tool_speech: 'force' } },
    },
  };
}
