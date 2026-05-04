import { z } from 'zod';

export const SeoOutputSchema = z.object({
  title: z.string().min(1).max(90),
  meta_description: z.string().min(1).max(220),
  h1: z.string().min(1).max(140),
  description: z.string().min(1).max(3500),
  bullets: z.array(z.string().min(1).max(240)).min(3).max(8),
});

export type SeoOutput = z.infer<typeof SeoOutputSchema>;
