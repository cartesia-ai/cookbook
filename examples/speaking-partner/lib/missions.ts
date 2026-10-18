import { z } from "zod";
import raw from "@/data/missions.json";

export const DIFFICULTIES = ["Easy", "Medium", "Hard", "Expert"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const MissionSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  desc: z.string().min(1),
  target_role: z.string().min(1),
});
export type Mission = z.infer<typeof MissionSchema>;

const parsed = z.array(MissionSchema).parse(raw);
if (new Set(parsed.map((m) => m.id)).size !== parsed.length) throw new Error("missions.json has a duplicate id");

export const MISSIONS: readonly Mission[] = parsed;

export function getMission(id: number): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}
