export function getApiKey(): string | undefined {
  return process.env.CARTESIA_API_KEY || undefined;
}

export function getAgentId(): string | undefined {
  return process.env.CARTESIA_AGENT_ID || undefined;
}
