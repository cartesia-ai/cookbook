import Cartesia from "@cartesia/cartesia-js";

export function cartesiaConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.CARTESIA_API_KEY);
}

export async function mintBrowserToken(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const client = new Cartesia({ apiKey: env.CARTESIA_API_KEY });
  const { token } = await client.accessToken.create({
    grants: { stt: true, tts: true },
    expires_in: 60,
  });
  return token;
}
