import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { longformItems, byNewest, SITE_TITLE } from '../lib/feeds';

/**
 * Writing and projects only — the long-form.
 *
 * The split is by what it asks of the reader, not by collection. Everything
 * here has a title, an intro and a page of its own; it is something you sit
 * down to read. Notes and stash are a different kind of thing, and someone who
 * wants the essays without a week of one-line notes in between has somewhere
 * to go.
 *
 * Named for what it contains rather than for a collection, since it spans two.
 */
export async function GET(context: APIContext) {
  return rss({
    title: `${SITE_TITLE} — Writing and Projects`,
    description: 'Long-form only: articles and project case studies.',
    site: context.site!,
    items: (await longformItems()).sort(byNewest),
    customData: '<language>en-gb</language>',
  });
}
