import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import {
  longformItems,
  streamItems,
  byNewest,
  SITE_TITLE,
  SITE_DESCRIPTION,
} from '../lib/feeds';

/**
 * The whole site: writing, projects, notes and stash, in publication order.
 *
 * The default feed, and the one linked from the nav — someone who subscribes
 * to a personal site generally means "tell me what this person published".
 * /articles.xml exists for the narrower case.
 */
export async function GET(context: APIContext) {
  const [longform, stream] = await Promise.all([
    longformItems(),
    streamItems(context.site),
  ]);

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site!,
    items: [...longform, ...stream].sort(byNewest),
    customData: '<language>en-gb</language>',
  });
}
