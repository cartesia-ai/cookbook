import { describe, expect, it, vi } from 'vitest';
import { createAgentTokenHandler, mintAgentToken } from '../src/server';

const FAKE_KEY = 'sk_test_not_a_real_key';

function stub(impl?: () => Promise<{ token: string }>) {
  const create = vi.fn((_args?: { expires_in?: number }) =>
    impl ? impl() : Promise.resolve({ token: 'tok_abc' }),
  );
  return { client: { accessToken: { create } } as never, create };
}

describe('mintAgentToken', () => {
  it('requests only the agent grant with a 60 s expiry', async () => {
    const { client, create } = stub();
    const out = await mintAgentToken({ client });
    expect(create).toHaveBeenCalledWith({ grants: { agent: true }, expires_in: 60 });
    expect(out).toEqual({ token: 'tok_abc', expiresIn: 60 });
  });
  it('clamps the expiry to 1..3600', async () => {
    const { client, create } = stub();
    await mintAgentToken({ client, expiresIn: 99999 });
    await mintAgentToken({ client, expiresIn: -5 });
    expect(create.mock.calls[0]![0]!.expires_in).toBe(3600);
    expect(create.mock.calls[1]![0]!.expires_in).toBe(1);
  });
  it('throws a clear error without a key or client', async () => {
    const saved = process.env.CARTESIA_API_KEY;
    delete process.env.CARTESIA_API_KEY;
    try {
      await expect(mintAgentToken()).rejects.toThrow(/CARTESIA_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.CARTESIA_API_KEY = saved;
    }
  });
});

describe('createAgentTokenHandler', () => {
  const req = () => new Request('http://localhost/api/agent-token', { method: 'POST' });

  it('returns the token with no-store', async () => {
    const { client } = stub();
    const res = await createAgentTokenHandler({ client })(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ token: 'tok_abc' });
  });
  it('returns 401 when authorize says no, without minting', async () => {
    const { client, create } = stub();
    const res = await createAgentTokenHandler({ client, authorize: () => false })(req());
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
  it('returns 502 with no upstream details on failure', async () => {
    const { client } = stub(async () => {
      throw new Error(`upstream said key ${FAKE_KEY} is bad`);
    });
    const res = await createAgentTokenHandler({ client, apiKey: FAKE_KEY })(req());
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain('upstream');
  });
});
