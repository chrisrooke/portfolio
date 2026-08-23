import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';
import {
  baseFields,
  titledFields,
  coverFields,
  hasAltWithCover,
  altRequiredError,
} from './content/fields';

/**
 * Controlled tag vocabulary. One shared list across all collections — a
 * "sci-fi" tag on a Stash book is the same tag as on a Writing post.
 *
 * No routes are generated from this; it exists so tag references are validated
 * at build time and so filter UI has display names to show. Adding /writing/tags/[tag]
 * later needs one route file and zero data changes.
 */
const tags = defineCollection({
  loader: file('src/content/tags.json'),
  schema: z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
});

/**
 * Articles. Internal posts have an MDX body; external link-posts have
 * frontmatter only plus an externalUrl, and live in this same collection so
 * they sort and filter alongside everything else.
 */
const writing = defineCollection({
  loader: glob({ base: './src/content/writing', pattern: '**/*.mdx' }),
  schema: ({ image }) =>
    z
      .object({
        ...baseFields,
        ...titledFields,
        ...coverFields(image),
        /** Set on link-posts hosted elsewhere. Suppresses local page generation. */
        externalUrl: z.url().optional(),
        /** Publication name, e.g. "Smashing Magazine". Shown as "on {source}". */
        externalSource: z.string().optional(),
      })
      .refine(hasAltWithCover, altRequiredError)
      .refine((data) => !data.externalSource || data.externalUrl, {
        message: 'externalSource is meaningless without externalUrl.',
        path: ['externalSource'],
      }),
});

export const collections = { tags, writing };
