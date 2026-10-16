export const MODES = ["teacher", "immersive"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_COPY: Record<Mode, { label: string; blurb: string }> = {
  teacher: {
    label: "Teacher",
    blurb: "Your partner stays in character, nudges you with words and phrases, and explains in your own language when you are stuck.",
  },
  immersive: {
    label: "Immersive",
    blurb: "Your partner only plays the role. If you ask for help in your own language, you have to say the phrase in the target language first.",
  },
};

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}
