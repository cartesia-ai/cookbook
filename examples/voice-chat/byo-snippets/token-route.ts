import Cartesia from "@cartesia/cartesia-js";

export async function POST(): Promise<Response> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 503 });
  }
  const client = new Cartesia({ apiKey });
  const { token } = await client.accessToken.create({
    grants: { stt: true, tts: true },
    expires_in: 60,
  });
  return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
