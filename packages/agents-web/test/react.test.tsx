// @vitest-environment jsdom
import { StrictMode, createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CartesiaAgentClient } from '../src/client';
import { useCartesiaAgent } from '../src/react';
import { READY, makeHarness } from './fakes';

function setup(extra: Record<string, unknown> = {}) {
  const h = makeHarness();
  const created: CartesiaAgentClient[] = [];
  const clientFactory = (o: ConstructorParameters<typeof CartesiaAgentClient>[0]) => {
    const c = new CartesiaAgentClient(o);
    created.push(c);
    return c;
  };
  const opts = { ...(h.options as never as { agentId: string; getToken: () => Promise<string> }), clientFactory, ...extra };
  return { h, created, opts };
}

describe('useCartesiaAgent', () => {
  it('tracks status and transcript messages', async () => {
    const { h, opts } = setup();
    const { result } = renderHook(() => useCartesiaAgent(opts as never));
    let p!: Promise<void>;
    act(() => {
      p = result.current.start();
    });
    await act(async () => {
      await new Promise((r) => setImmediate(r));
      h.sockets[0]!.open();
      h.sockets[0]!.message(READY);
      await p;
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.callId).toBe('call_1');
    act(() => {
      const ws = h.sockets[0]!;
      ws.message({ type: 'turn_started', turn: 1, role: 'assistant', start_time: 0 });
      ws.message({ type: 'turn_output_text_delta', turn: 1, role: 'assistant', text: 'Hi' });
    });
    expect(result.current.messages).toEqual([
      expect.objectContaining({ turn: 1, role: 'assistant', text: 'Hi', final: false }),
    ]);
    act(() => {
      h.sockets[0]!.message({
        type: 'turn_ended', turn: 1, role: 'assistant', text: 'Hi!', interrupted: false,
        start_time: 0, end_time: 1, tool_calls: [],
      });
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ text: 'Hi!', final: true });
  });

  it('stops the client on unmount', async () => {
    const { h, opts, created } = setup();
    const { result, unmount } = renderHook(() => useCartesiaAgent(opts as never));
    let p!: Promise<void>;
    act(() => {
      p = result.current.start();
    });
    await act(async () => {
      await new Promise((r) => setImmediate(r));
      h.sockets[0]!.open();
      h.sockets[0]!.message(READY);
      await p;
    });
    unmount();
    expect(h.sockets[0]!.closedWith?.code).toBe(1000);
    expect(created[0]!.status).not.toBe('ready');
  });

  it('strict mode double mount opens no session on its own', () => {
    const { h, opts, created } = setup();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
    renderHook(() => useCartesiaAgent(opts as never), { wrapper });
    expect(h.sockets).toHaveLength(0);
    expect(created.every((c) => c.status === 'idle')).toBe(true);
  });

  it('does not recreate the client when inline callbacks change', () => {
    const { opts, created } = setup();
    const { rerender } = renderHook(() =>
      useCartesiaAgent({ ...opts, getToken: async () => 'x', onEvent: () => {} } as never),
    );
    rerender();
    rerender();
    expect(created).toHaveLength(1);
  });

  it('recreates the client when agentId changes', () => {
    const { opts, created } = setup();
    const { rerender } = renderHook((p: { id: string }) => useCartesiaAgent({ ...opts, agentId: p.id } as never), {
      initialProps: { id: 'a' },
    });
    rerender({ id: 'b' });
    expect(created).toHaveLength(2);
  });

  it('forwards events to onEvent', async () => {
    const { h, opts } = setup();
    const onEvent = vi.fn();
    const { result } = renderHook(() => useCartesiaAgent({ ...opts, onEvent } as never));
    let p!: Promise<void>;
    act(() => {
      p = result.current.start();
    });
    await act(async () => {
      await new Promise((r) => setImmediate(r));
      h.sockets[0]!.open();
      h.sockets[0]!.message(READY);
      await p;
    });
    expect(onEvent.mock.calls.some((c) => c[0] === 'ready')).toBe(true);
  });
});
