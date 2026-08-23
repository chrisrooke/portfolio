import { z } from 'astro/zod';
import { reference } from 'astro:content';
import type { ImageFunction } from 'astro:content';

/**
 * Shared frontmatter field groups, composed into collection schemas by
 * spreading them into a z.object(). See docs/content-architecture.md §3.1.
 *
 * These are plain objects of Zod types rather than assembled schemas, because
 * spreading composes far more cleanly than chained .extend() calls — and it
 * keeps each collection's full shape visible in one place in content.config.ts.
 */

/** On every collection. */
export const baseFields = {
  /**
   * z.coerce.date() is deliberate: YAML parses an unquoted 2026-08-23 into a
   * Date, but a quoted "2026-08-23" stays a string. Coercing accepts both, so
   * frontmatter style never becomes a build error.
   */
  publishDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  draft: z.boolean().default(false),
  tags: z.array(reference('tags')).default([]),
};

/** On anything with a headline and standfirst. */
export const titledFields = {
  title: z.string(),
  intro: z.string(),
};

/**
 * Cover image. A factory, because image() is only available from the schema
 * context callback: `schema: ({ image }) => z.object({ ...coverFields(image) })`
 */
export const coverFields = (image: ImageFunction) => ({
  cover: image().optional(),
  coverAlt: z.string().optional(),
});

/**
 * Enforces the cover/coverAlt pairing. Both are optional individually, but a
 * cover without alt text is an accessibility bug we'd rather catch at build
 * time than in an audit. Decorative images opt out explicitly with `coverAlt: ""`,
 * which makes the intent visible in the frontmatter rather than an omission.
 *
 * Apply with `.refine(hasAltWithCover, altRequiredError)`.
 */
export const hasAltWithCover = (data: { cover?: unknown; coverAlt?: string }) =>
  data.cover === undefined || data.coverAlt !== undefined;

export const altRequiredError = {
  message:
    'coverAlt is required when cover is set. Use an empty string for purely decorative images.',
  path: ['coverAlt'],
};
