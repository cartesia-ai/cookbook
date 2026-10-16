export type AgentErrorCode =
  | 'mic_denied'
  | 'mic_unavailable'
  | 'worklet_failed'
  | 'token_failed'
  | 'connect_timeout'
  | 'closed'
  | 'invalid_state'
  | 'server_error'
  | 'socket_error';

export class CartesiaAgentError extends Error {
  readonly code: AgentErrorCode | string;
  readonly closeCode?: number;

  constructor(
    code: AgentErrorCode | string,
    message: string,
    opts: { cause?: unknown; closeCode?: number } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'CartesiaAgentError';
    this.code = code;
    this.closeCode = opts.closeCode;
  }
}

export function describeCloseCode(code: number): string {
  switch (code) {
    case 1000:
      return 'Session ended normally.';
    case 1008:
      return 'The server rejected the session as a protocol error (close 1008). Check the access token and the first event.';
    case 1009:
      return 'A message was larger than 32 KiB (close 1009).';
    case 1011:
      return 'The agent failed (close 1011).';
    case 1006:
      return 'The connection dropped before a clean close (1006). The token may be invalid or expired, or the network failed.';
    default:
      return `The connection closed (code ${code}).`;
  }
}
