import { getCollection, getEntries, type CollectionEntry } from 'astro:content';

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

export type ProjectEntry = CollectionEntry<'projects'>;

export const projectHref = (entry: ProjectEntry): string => `/projects/${entry.id}`;

/** All projects, newest first. Drafts excluded in production builds. */
export async function getProjects(): Promise<ProjectEntry[]> {
  return (await getCollection('projects')).filter(isPublished).sort(byNewest);
}

/**
 * A project's writing series, in the order the project declares — not date
 * order. Reading order is authorial: a part can be published late or backdated
 * without moving in the series.
 *
 * Drafts are dropped here too, which means part numbering is always over the
 * posts a reader can actually reach. A draft sitting at position 2 of 4 would
 * otherwise produce a visible "Part 3 of 4" with no part 2 to link to.
 */
export async function getProjectSeries(project: ProjectEntry): Promise<WritingEntry[]> {
  const refs = project.data.relatedWriting;
  if (refs.length === 0) return [];

  const entries = await getEntries(refs);

  /*
   * getEntries() returns undefined for a reference that doesn't resolve. Astro
   * logs a clear [content] error at sync but does not halt, so the failure
   * would otherwise surface much later as a TypeError on `.data` inside a
   * bundled chunk — see docs/content-architecture.md §2. Naming it here keeps
   * the first error the useful one.
   */
  const missing = refs.filter((_, i) => !entries[i]).map((ref) => ref.id);
  if (missing.length > 0) {
    throw new Error(
      `Project "${project.id}" references writing entries that do not exist:\n` +
        missing.map((id) => `  - ${id}`).join('\n'),
    );
  }

  return entries.filter(isPublished);
}

/** Where a post sits in a project's series. `total` of 1 means "related", not "part 1 of 1". */
export type SeriesPosition = {
  project: ProjectEntry;
  part: number;
  total: number;
};

/**
 * The reverse of relatedWriting: writing id → its place in a project's series.
 *
 * Derived rather than stored, so a post declares nothing and cannot fall out of
 * sync with the project that lists it. Built once per page that needs it.
 */
export async function getWritingSeriesIndex(): Promise<Map<string, SeriesPosition>> {
  const projects = await getProjects();
  const series = await Promise.all(projects.map(getProjectSeries));
  const index = new Map<string, SeriesPosition>();

  projects.forEach((project, i) => {
    const posts = series[i];
    posts.forEach((post, position) => {
      const existing = index.get(post.id);
      if (existing) {
        throw new Error(
          `Writing entry "${post.id}" is listed by two projects ` +
            `("${existing.project.id}" and "${project.id}"). ` +
            'A post can belong to one series, or "part n of m" is ambiguous.',
        );
      }
      index.set(post.id, { project, part: position + 1, total: posts.length });
    });
  });

  return index;
}

export type TagEntry = CollectionEntry<'tags'>;

/**
 * Resolves an entry's tag references into full tag entries, so components can
 * show display names ("Design Systems") rather than slugs ("design-systems").
 */
export async function resolveTags(entry: {
  data: { tags: { collection: 'tags'; id: string }[] };
}): Promise<TagEntry[]> {
  if (entry.data.tags.length === 0) return [];
  return getEntries(entry.data.tags);
}

/**
 * The tags actually applied to a given set of entries, alphabetical by display
 * name.
 *
 * Filter UI is built from this rather than from the whole `tags` collection,
 * so a filter can never be offered that would return nothing. It also means
 * the vocabulary can hold tags reserved for future use without them appearing
 * as dead buttons.
 */
export async function getTagsInUse(entries: {
  data: { tags: { id: string }[] };
}[]): Promise<TagEntry[]> {
  const used = new Set(entries.flatMap((entry) => entry.data.tags.map((t) => t.id)));
  if (used.size === 0) return [];

  const all = await getCollection('tags');
  return all
    .filter((tag) => used.has(tag.id))
    .sort((a, b) => a.data.name.localeCompare(b.data.name));
}

/** Tag slugs for an entry, for data attributes consumed by client-side filtering. */
export const tagSlugs = (entry: { data: { tags: { id: string }[] } }): string =>
  entry.data.tags.map((t) => t.id).join(' ');
