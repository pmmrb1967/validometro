// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * What each prompt must answer, checked with Zod. The same schemas go to the APIs as JSON
 * Schema, so the models are held to them; Zod checks again because not all of them obey.
 * Optional values are `null`, not missing: every structured-output API accepts that.
 */
import { z } from 'zod';
import { CATEGORIES } from '../domain/categories';

const categoryIds = CATEGORIES.map((category) => category.id) as [string, ...string[]];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const lineSchema = z.object({
  raw: z.string().max(200).nullable(),
  name: z.string().min(1).max(120),
  category: z.enum(categoryIds).nullable(),
  quantity: z.number().nullable(),
  unit: z.string().max(20).nullable(),
  perishable: z.boolean(),
});

export const receiptSchema = z.object({
  store: z.string().max(80).nullable(),
  date: isoDate,
  lines: z.array(lineSchema).max(150),
});
export type ReceiptReading = z.infer<typeof receiptSchema>;

export const voiceSchema = z.object({
  lines: z.array(lineSchema.omit({ raw: true }).extend({ expires_at: isoDate })).max(60),
});
export type VoiceReading = z.infer<typeof voiceSchema>;

export const dateSchema = z.object({
  date: isoDate,
  kind: z.enum(['consumir_ate', 'consumir_de_preferencia', 'desconhecido']),
});
export type DateReading = z.infer<typeof dateSchema>;

export const testSchema = z.object({ ok: z.boolean() });

/** JSON Schema for the APIs, without the `$schema` line some of them reject. */
export function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
