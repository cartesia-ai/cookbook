import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CartesiaAgentClient,
  type AgentEventMap,
  type AgentStatus,
  type CartesiaAgentOptions,
} from './client';
import type { CartesiaAgentError } from './errors';
import { CartesiaAgentError as AgentError } from './errors';
import type { Role } from './protocol';

export interface AgentMessage {
  turn: number;
  role: Role;
  text: string;
  final: boolean;
  interrupted?: boolean;
}

export interface UseCartesiaAgentOptions extends CartesiaAgentOptions {
  onEvent?: <K extends keyof AgentEventMap>(type: K, event: AgentEventMap[K]) => void;
  clientFactory?: (opts: CartesiaAgentOptions) => CartesiaAgentClient;
}

const EVENTS: Array<keyof AgentEventMap> = [
  'status',
  'ready',
  'turn_started',
  'turn_delta',
  'turn_ended',
  'transcript',
  'client_tool_call',
  'barge_in',
  'speaking',
  'error',
  'close',
  'raw',
];

export function useCartesiaAgent(opts: UseCartesiaAgentOptions) {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [speaking, setSpeaking] = useState<'user' | 'agent' | 'none'>('none');
  const [error, setError] = useState<CartesiaAgentError | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const clientRef = useRef<CartesiaAgentClient | null>(null);
  const keyRef = useRef('');
  const key = `${opts.agentId}|${opts.inputFormat ?? ''}`;
  if (!clientRef.current || keyRef.current !== key) {
    keyRef.current = key;
    const base: CartesiaAgentOptions = {
      ...opts,
      getToken: () => optsRef.current.getToken(),
      tools: opts.tools
        ? new Proxy({} as NonNullable<CartesiaAgentOptions['tools']>, {
            get: (_t, name: string) => optsRef.current.tools?.[name],
          })
        : undefined,
    };
    clientRef.current = (opts.clientFactory ?? ((o) => new CartesiaAgentClient(o)))(base);
  }
  const client = clientRef.current;

  useEffect(() => {
    const offs: Array<() => void> = [];
    for (const type of EVENTS) {
      offs.push(
        client.on(type, (event: AgentEventMap[typeof type]) => {
          optsRef.current.onEvent?.(type, event);
        }),
      );
    }
    offs.push(client.on('status', (e) => setStatus(e.status)));
    offs.push(
      client.on('ready', (e) => {
        setCallId(e.callId);
        setError(null);
      }),
    );
    offs.push(client.on('speaking', (e) => setSpeaking(e.who)));
    offs.push(
      client.on('transcript', (e) => {
        setMessages((prev) => {
          const msg: AgentMessage = {
            turn: e.turn,
            role: e.role,
            text: e.text,
            final: e.final,
            interrupted: e.interrupted,
          };
          const i = prev.findIndex((m) => m.turn === e.turn);
          if (i < 0) return [...prev, msg];
          const next = prev.slice();
          next[i] = msg;
          return next;
        });
      }),
    );
    offs.push(
      client.on('error', (e) => {
        if (e.fatal) setError(new AgentError(e.code, e.message));
      }),
    );
    setStatus(client.status);
    return () => {
      offs.forEach((off) => off());
      void client.stop();
    };
  }, [client]);

  const start = useCallback(async () => {
    setMessages([]);
    setError(null);
    try {
      await client.start();
    } catch (err) {
      setError(
        err instanceof AgentError ? err : new AgentError('connect_failed', String(err), { cause: err }),
      );
      throw err;
    }
  }, [client]);

  const stop = useCallback(() => client.stop(), [client]);
  const setMuted = useCallback(
    (m: boolean) => {
      client.setMuted(m);
      setMutedState(m);
    },
    [client],
  );
  const sendToolResult = useCallback<CartesiaAgentClient['sendToolResult']>(
    (id, result, o) => client.sendToolResult(id, result, o),
    [client],
  );

  return {
    status,
    isSpeaking: { user: speaking === 'user', agent: speaking === 'agent' },
    messages,
    error,
    callId,
    muted,
    start,
    stop,
    setMuted,
    sendToolResult,
  };
}
