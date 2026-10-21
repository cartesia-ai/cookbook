export class BodyTooLargeError extends Error {}

export function declaredTooLarge(req: Request, max: number): boolean {
  const length = Number(req.headers.get("content-length"));
  return Number.isFinite(length) && length > max;
}

export async function readJson(req: Request, max: number): Promise<unknown> {
  if (declaredTooLarge(req, max)) throw new BodyTooLargeError();
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel().catch(() => {});
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
