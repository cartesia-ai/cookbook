import { File, Paths } from "expo-file-system";

export async function bytesToPlayableUri(bytes: ArrayBuffer, name: string): Promise<string> {
  const file = new File(Paths.cache, `${name.replace(/[^a-z0-9-]/gi, "")}.mp3`);
  if (file.exists) file.delete();
  await file.write(new Uint8Array(bytes));
  return file.uri;
}
