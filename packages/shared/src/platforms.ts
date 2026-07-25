import { z } from "zod";

export const PlatformSchema = z.enum(["tiktok", "instagram", "youtube"]);
export type Platform = z.infer<typeof PlatformSchema>;

export const PLATFORMS: Platform[] = ["tiktok", "instagram", "youtube"];
