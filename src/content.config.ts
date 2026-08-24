import { defineCollection, reference } from 'astro:content';
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

/**
 * Case studies. The body is the write-up; the frontmatter carries the facts a
 * reader scans for before reading anything (role, year, stack, links out).
 */
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.mdx' }),
  schema: ({ image }) =>
    z
      .object({
        ...baseFields,
        ...titledFields,
        ...coverFields(image),
        /** The live project. */
        url: z.url().optional(),
        repoUrl: z.url().optional(),
        role: z.string().optional(),
        /** Year the work happened — not the date this case study was posted. */
        year: z.number().int().optional(),
        tech: z.array(z.string()).default([]),
        /**
         * The single source of truth for the project ↔ writing relationship,
         * and — because it is an array — for the *order* of a series.
         *
         * Reading order is authorial, not chronological: a part can be
         * published late, or backdated, without changing where it sits in the
         * series. Storing the reverse direction on each post instead would
         * need a hand-maintained part number with nothing validating it.
         * See docs/content-architecture.md §3.4.
         */
        relatedWriting: z.array(reference('writing')).default([]),
      })
      .refine(hasAltWithCover, altRequiredError),
});

/**
 * Microblog thoughts. Short by convention, never by validation — Zod cannot see
 * the body, so nothing enforces brevity and the feed layout must tolerate a
 * note that runs long. See docs/content-architecture.md §3.5.
 *
 * `.md`, not `.mdx`: notes need links and emphasis, not components. No cover,
 * no intro, and `title` is optional because most notes don't want one.
 */
const notes = defineCollection({
  loader: glob({ base: './src/content/notes', pattern: '**/*.md' }),
  schema: z
    .object({
      ...baseFields,
      title: z.string().optional(),
      /** Optional link out — the "here's an article worth reading" case. */
      url: z.url().optional(),
      /** Link text. Falls back to the URL's host when omitted. */
      urlLabel: z.string().optional(),
    })
    .refine((data) => !data.urlLabel || data.url, {
      message: 'urlLabel is meaningless without url.',
      path: ['urlLabel'],
    }),
});

export const collections = { tags, writing, projects, notes };
