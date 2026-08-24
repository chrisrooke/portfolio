import type { RSSFeedItem } from '@astrojs/rss';
import { getWriting, getProjects, getStream, writingHref, projectHref } from './content';
import { formatDate } from './format';

/**
 * Shared item-building for the two RSS feeds — see docs/content-architecture.md §4.6.
 *
 * Two feeds, one shared shape. The split is by *commitment asked of the
 * reader*, not by collection: /articles.xml is the titled, permalinked
 * long-form, and /rss.xml is that plus the stream.
 */

export const SITE_TITLE = 'Chris Rooke';
export const SITE_DESCRIPTION = 'Portfolio, writing, and notes.';

export const byNewest = (a: RSSFeedItem, b: RSSFeedItem): number =>
  (b.pubDate?.valueOf() ?? 0) - (a.pubDate?.valueOf() ?? 0);

/**
 * Writing and projects: everything with a title, an intro and a page of its
 * own. Both are things someone sits down to read, which is the line the
 * narrower feed is drawn along.
 */
export async function longformItems(): Promise<RSSFeedItem[]> {
  const [writing, projects] = await Promise.all([getWriting(), getProjects()]);

  return [
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
  ];
}

/**
 * Notes and stash. These have no page of their own, so they link to a fragment
 * on their feed page — without a unique link per item, readers key on the URL
 * and collapse every note into a single entry.
 */
export async function streamItems(site: URL | undefined): Promise<RSSFeedItem[]> {
  const stream = await getStream();

  return stream.map((item) => ({
    /*
     * RSS has no concept of an untitled item — readers render a blank row — so
     * an untitled note needs the same fallback its accessible name uses, or
     * the two disagree about what the thing is called.
     */
    title:
      item.entry.data.title ??
      `${item.kind === 'note' ? 'Note' : 'Stash'} — ${formatDate(item.date)}`,
    description: item.entry.data.title
      ? undefined
      : item.entry.body?.trim().slice(0, 200),
    pubDate: item.date,
    /*
     * Absolute, unlike the longform links. @astrojs/rss normalises relative
     * links by appending a trailing slash, which on a fragment link lands
     * *after* the hash — "/notes#note-x/" — and silently breaks the anchor.
     * Building the URL here keeps the fragment last.
     */
    link: new URL(
      `/${item.kind === 'note' ? 'notes' : 'stash'}/#${item.kind}-${item.entry.id}`,
      site,
    ).href,
    categories: item.tags,
  }));
}
