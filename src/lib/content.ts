import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * The view layer. Pages import from here and never call getCollection()
 * directly — see docs/content-architecture.md §4.
 *
 * The point is that draft filtering and date sorting exist in exactly one
 * place. Repeated at six call sites, a draft filter is eventually forgotten at
 * the seventh, and an unpublished post goes live. Here it cannot be.
 */

export type WritingEntry = CollectionEntry<'writing'>;

/** Every collection shares baseFields, so these helpers are generic. */
type Dated = { data: { publishDate: Date; draft: boolean } };

/**
 * Drafts render in `astro dev` and vanish in `astro build`, so work in
 * progress is visible while writing without any risk of it shipping.
 */
export const isPublished = <T extends Dated>(entry: T): boolean =>
  import.meta.env.PROD ? !entry.data.draft : true;

export const byNewest = <T extends Dated>(a: T, b: T): number =>
  b.data.publishDate.valueOf() - a.data.publishDate.valueOf();

/** A link-post hosted elsewhere: frontmatter only, no local page. */
export const isExternal = (entry: WritingEntry): boolean =>
  Boolean(entry.data.externalUrl);

/** Where a preview should point — off-site for link-posts, local otherwise. */
export const writingHref = (entry: WritingEntry): string =>
  entry.data.externalUrl ?? `/writing/${entry.id}`;

/**
 * The invariant Zod cannot express.
 *
 * A schema validates frontmatter only — it never sees the body — so it cannot
 * enforce "an entry has a body OR an externalUrl". Without this check, a post
 * with neither builds successfully as a blank page, which is the kind of thing
 * you discover months later. Enforced here instead, at build time.
 */
function assertRenderable(entries: WritingEntry[]): void {
  const empty = entries.filter(
    (entry) => !isExternal(entry) && !entry.body?.trim(),
  );

  if (empty.length > 0) {
    const list = empty.map((e) => `  - ${e.id}`).join('\n');
    throw new Error(
      `Writing entries with no body and no externalUrl:\n${list}\n` +
        'Add content, or set externalUrl to make it a link-post.',
    );
  }
}

/** All writing, newest first. Drafts excluded in production builds. */
export async function getWriting(): Promise<WritingEntry[]> {
  const entries = (await getCollection('writing')).filter(isPublished);
  assertRenderable(entries);
  return entries.sort(byNewest);
}

/**
 * Only posts that get a local page. Used by getStaticPaths in Phase 3 so no
 * empty route is generated for a link-post.
 */
export async function getInternalWriting(): Promise<WritingEntry[]> {
  return (await getWriting()).filter((entry) => !isExternal(entry));
}
