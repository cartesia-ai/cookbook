import Cartesia from '@cartesia/cartesia-js';

const client = new Cartesia({ apiKey: process.env.CARTESIA_API_KEY });

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) {
    return Response.json({ error: 'Send an audio file under 4 MB' }, { status: 400 });
  }

  try {
    const res = await client.stt.transcribe({
      file,
      model: 'ink-whisper',
      language: 'en',
    });
    return Response.json({ transcript: res.text, duration: res.duration });
  } catch (err) {
    if (err instanceof Cartesia.APIError && err.status) {
      const error = err.status === 429 ? 'Too many requests. Try again shortly.' : 'Transcription failed';
      return Response.json({ error }, { status: err.status });
    }
    throw err;
  }
}
