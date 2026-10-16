export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const RECORD_STOP_BYTES = Math.floor(3.6 * 1024 * 1024);
export const RECORD_BITS_PER_SECOND = 24_000;
export const MAX_RECORD_SECONDS = 20 * 60;
export const MAX_TRANSCRIPT_CHARS = 120_000;

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
  { code: "sv", label: "Swedish" },
  { code: "uk", label: "Ukrainian" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function normalizeLanguage(value: unknown): LanguageCode {
  const match = LANGUAGES.find((l) => l.code === value);
  return match ? match.code : DEFAULT_LANGUAGE;
}

export const AUDIO_EXTENSIONS = ["mp3", "m4a", "wav", "webm", "ogg", "oga", "flac", "mp4", "mpeg", "mpga"] as const;

export const RECORDER_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"] as const;

export function extensionForMime(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  return "webm";
}
