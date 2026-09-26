import { z } from 'zod';
import { BEST_OF_OPTIONS, BOARD_H, BOARD_W, DIFFICULTIES, NAME_MAX, NAME_MIN, PICTURE_PACKS } from './constants';

export const nameSchema = z
  .string()
  .trim()
  .min(NAME_MIN)
  .max(NAME_MAX)
  .regex(/^[\p{L}\p{N} _.\-]+$/u, 'Letters, numbers, spaces, _ . - only');

export const sessionSchema = z.object({
  token: z.string().min(20).max(100).optional(),
  name: z.string().max(40).optional(),
});

const bestOf = z.union(BEST_OF_OPTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<5>]);

export const roomConfigSchema = z.object({ difficulty: z.enum(DIFFICULTIES), bestOf, pack: z.enum(PICTURE_PACKS) });
export const roomJoinSchema = z.object({ code: z.string().regex(/^[A-Z0-9]{5}$/) });
export const difficultySchema = z.object({ difficulty: z.enum(DIFFICULTIES) });
export const soloSchema = z.object({ difficulty: z.enum(DIFFICULTIES), pack: z.enum(['ghibli', 'photos']) });

export const placeSchema = z.object({
  round: z.number().int().min(1).max(20),
  index: z.number().int().min(0).max(200),
  // Where the piece's cell top-left was dropped, in board coordinates.
  x: z.number().finite().min(-BOARD_W).max(BOARD_W * 2),
  y: z.number().finite().min(-BOARD_H).max(BOARD_H * 2),
});

export type RoomConfigInput = z.infer<typeof roomConfigSchema>;
export type RoomJoinInput = z.infer<typeof roomJoinSchema>;
export type DifficultyInput = z.infer<typeof difficultySchema>;
export type SoloInput = z.infer<typeof soloSchema>;
export type PlaceInput = z.infer<typeof placeSchema>;
