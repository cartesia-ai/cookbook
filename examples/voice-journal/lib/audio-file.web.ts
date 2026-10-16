const urls = new Map<string, string>();

export async function bytesToPlayableUri(bytes: ArrayBuffer, name: string): Promise<string> {
  const old = urls.get(name);
  if (old) URL.revokeObjectURL(old);
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
  urls.set(name, url);
  return url;
}
