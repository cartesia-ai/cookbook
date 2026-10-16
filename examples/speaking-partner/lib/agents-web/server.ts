import Cartesia from '@cartesia/cartesia-js';

export interface MintAgentTokenOptions {
  apiKey?: string;
  client?: Pick<Cartesia, 'accessToken'>;
  expiresIn?: number;
}

export async function mintAgentToken(
  opts: MintAgentTokenOptions = {},
): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = Math.min(3600, Math.max(1, Math.floor(opts.expiresIn ?? 60)));
  let client = opts.client;
  if (!client) {
    const apiKey = opts.apiKey ?? process.env.CARTESIA_API_KEY;
    if (!apiKey) {
      throw new Error('CARTESIA_API_KEY is not set. Pass apiKey or client to mintAgentToken.');
    }
    client = new Cartesia({ apiKey });
  }
  const { token } = await client.accessToken.create({
    grants: { agent: true },
    expires_in: expiresIn,
  });
  return { token, expiresIn };
}

export interface AgentTokenHandlerOptions extends MintAgentTokenOptions {
  authorize?: (req: Request) => boolean | Promise<boolean>;
}

export function createAgentTokenHandler(
  opts: AgentTokenHandlerOptions = {},
): (req: Request) => Promise<Response> {
  const { authorize, ...mint } = opts;
  const headers = { 'Cache-Control': 'no-store' };
  return async (req) => {
    if (authorize && !(await authorize(req))) {
      return Response.json({ error: 'unauthorized' }, { status: 401, headers });
    }
    try {
      const { token } = await mintAgentToken(mint);
      return Response.json({ token }, { headers });
    } catch {
      return Response.json({ error: 'could not create a token' }, { status: 502, headers });
    }
  };
}
