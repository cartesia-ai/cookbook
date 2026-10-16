export const LANGS = ["en", "es", "fr", "hi", "ja"] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

type Copy = {
  names: Record<Lang, string>;
  empty: string;
  hint: string;
  listening: string;
  translating: string;
  speaking: string;
};

export const VOICES: Record<Lang, { id: string; name: string }> = {
  en: { id: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4", name: "Skylar" },
  es: { id: "35b2cfc1-e6fb-4d69-a598-c1780612be4a", name: "Darío" },
  fr: { id: "7c58f4a4-a72c-42fa-a503-41b9408820f3", name: "Inès" },
  hi: { id: "cb9c954d-bcaa-43ed-82bf-aeb5e88a3cb5", name: "Kabir" },
  ja: { id: "498e7f37-7fa3-4e2c-b8e2-8b6e9276f956", name: "Aiko" },
};

export const COPY: Record<Lang, Copy> = {
  en: {
    empty: "Your words show up here",
    names: { en: "English", es: "Spanish", fr: "French", hi: "Hindi", ja: "Japanese" },
    hint: "Speak {self}. The other person hears you in {other}.",
    listening: "Listening",
    translating: "Translating",
    speaking: "Speaking",
  },
  es: {
    empty: "Tus palabras aparecen aquí",
    names: { en: "inglés", es: "español", fr: "francés", hi: "hindi", ja: "japonés" },
    hint: "Habla en {self}. La otra persona te escucha en {other}.",
    listening: "Escuchando",
    translating: "Traduciendo",
    speaking: "Hablando",
  },
  fr: {
    empty: "Vos paroles s'affichent ici",
    names: { en: "anglais", es: "espagnol", fr: "français", hi: "hindi", ja: "japonais" },
    hint: "Parlez en {self}. L'autre personne vous entend en {other}.",
    listening: "À l'écoute",
    translating: "Traduction",
    speaking: "Lecture",
  },
  hi: {
    empty: "आपके शब्द यहाँ दिखेंगे",
    names: { en: "अंग्रेज़ी", es: "स्पेनिश", fr: "फ़्रेंच", hi: "हिन्दी", ja: "जापानी" },
    hint: "{self} में बोलिए। सामने वाला आपको {other} में सुनेगा।",
    listening: "सुन रहा है",
    translating: "अनुवाद हो रहा है",
    speaking: "बोल रहा है",
  },
  ja: {
    empty: "ここに会話が表示されます",
    names: { en: "英語", es: "スペイン語", fr: "フランス語", hi: "ヒンディー語", ja: "日本語" },
    hint: "{self}で話してください。相手には{other}で聞こえます。",
    listening: "聞いています",
    translating: "翻訳中",
    speaking: "再生中",
  },
};

export function nativeName(lang: Lang): string {
  const n = COPY[lang].names[lang];
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function englishName(lang: Lang): string {
  return COPY.en.names[lang];
}

export function hintFor(self: Lang, other: Lang): string {
  const c = COPY[self];
  return c.hint.replace("{self}", c.names[self]).replace("{other}", c.names[other]);
}

export function otherOf(pair: readonly [Lang, Lang], lang: Lang): Lang {
  return lang === pair[0] ? pair[1] : pair[0];
}
