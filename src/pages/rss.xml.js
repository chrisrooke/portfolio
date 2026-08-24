import rss from '@astrojs/rss';
import {
  getWriting,
  getProjects,
  getStream,
  writingHref,
  projectHref,
} from '../lib/content';
import { formatDate } from '../lib/format';

/**
 * One feed for the whole site, not one per collection.
 *
 * The homepage keeps Projects, Writing and the stream in separate sections
 * because they have different visual weight (§4.4), but that is a layout
 * argument and does not apply here — a reader subscribing to a personal site
 * wants what the person published, in the order they published it. Splitting
 * into four feeds would mostly produce three feeds nobody subscribes to.
 */
export async function GET(context) {
  const [writing, projects, stream] = await Promise.all([
    getWriting(),
    getProjects(),
    getStream(),
  ]);

  const items = [
    ...writing.map((entry) => ({
      title: entry.data.title,
      description: entry.data.intro,
      pubDate: entry.data.publishDate,
      link: writingHref(entry),
      categories: entry.data.tags.map((tag) => tag.id),
    })),

    ...projects.map((entry) => ({
      title: entry.data.title,
      description: entry.data.intro,
      pubDate: entry.data.publishDate,
      link: projectHref(entry),
      categories: entry.data.tags.map((tag) => tag.id),
    })),

    /*
     * Stream items have no page of their own, so they link to a fragment on
     * the feed page. Without a unique link per item, readers key on the URL
     * and collapse every note into a single entry.
     *
     * An untitled note still needs a title here — RSS has no concept of an
     * untitled item, and readers render a blank row. Same fallback as the
     * accessible name in FeedItem, so the two never disagree.
     */
    ...stream.map((item) => ({
      title:
        item.entry.data.title ??
        `${item.kind === 'note' ? 'Note' : 'Stash'} — ${formatDate(item.date)}`,
      description: item.entry.data.title ? undefined : item.entry.body?.trim().slice(0, 200),
      pubDate: item.date,
      /*
       * Absolute, unlike the others. @astrojs/rss normalises relative links by
       * appending a trailing slash, which on a fragment link lands *after* the
       * hash — "/notes#note-x/" — and silently breaks the anchor. Building the
       * URL here keeps the fragment last.
       */
      link: new URL(
        `/${item.kind === 'note' ? 'notes' : 'stash'}/#${item.kind}-${item.entry.id}`,
        context.site,
      ).href,
      categories: item.tags,
    })),
  ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: 'Chris Rooke',
    description: 'Portfolio, writing, and notes.',
    site: context.site,
    items,
    customData: '<language>en-gb</language>',
  });
}
