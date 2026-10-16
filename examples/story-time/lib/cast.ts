import { CHARACTER_POOL, NARRATOR, VOICES, type Line, type VoiceKey } from "./story";

export function speakerKey(speaker: string): string {
  return speaker.trim().toLowerCase();
}

export function isNarrator(speaker: string): boolean {
  return speakerKey(speaker) === NARRATOR.toLowerCase();
}

export function castVoices(cast: Record<string, VoiceKey>, narrator: VoiceKey, lines: Line[]): Record<string, VoiceKey> {
  const next = { ...cast };
  const pool = CHARACTER_POOL.filter((v) => v !== narrator);
  for (const line of lines) {
    if (isNarrator(line.speaker)) continue;
    const key = speakerKey(line.speaker);
    if (next[key]) continue;
    const used = Object.keys(next).length;
    next[key] = pool[used % pool.length]!;
  }
  return next;
}

export function voiceFor(speaker: string, cast: Record<string, VoiceKey>, narrator: VoiceKey): string {
  const key = isNarrator(speaker) ? narrator : (cast[speakerKey(speaker)] ?? narrator);
  return VOICES[key].id;
}
