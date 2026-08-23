# Content Architecture

Plan for the content model of the portfolio site. Written against **Astro 7.2.4**, which
uses the Content Layer API with **Zod 4.4.3**.

> **Import `z` from `astro/zod`, not `astro:content`.** Astro 7 deprecates
> `import { z } from 'astro:content'` — it still works but is slated for removal. Most
> tutorials online still show the old form. `reference`, `defineCollection`, `getCollection`,
> `getEntries`, and `render` all still come from `astro:content`; only `z` moved.

Status: **plan, not yet implemented.** Phases at the bottom.

---

## 1. The governing principle

> **Collections are storage. Feeds are views.**

The strongest temptation in this design is to let a *display* requirement dictate a
*storage* boundary. Two examples from the requirements:

- "Notes and Stash should sometimes appear in the same feed" → tempting to make them one
  collection.
- "External Writing posts have no body, just a URL" → tempting to make them a second
  collection.

Both should be resisted. Merging Notes and Stash forces a single schema onto two genuinely
different shapes (a Stash entry needs `creator`, `medium`, `year`; a Note needs none of
them), and every consumer then has to narrow the union anyway. Splitting external Writing
posts duplicates a schema and forces a merge-and-re-sort at every call site.

Instead: **collections stay shaped like the data**, and a thin view layer
(`src/lib/content.ts`) normalises, filters, sorts, and combines them for display. Pages
never call `getCollection()` directly — they call the view layer. This gives one place
where drafts are excluded and dates are sorted, which matters more than it sounds:
draft-leaking is the single most common bug in this kind of site, because the filter has to
be repeated at six call sites and eventually isn't.

---

## 2. Astro concepts in play

Brief, since these terms recur throughout.

| Term | What it is |
|---|---|
| **Collection** | A named set of entries, declared in `src/content.config.ts`. |
| **Loader** | Where the entries come from. `glob()` = one file per entry. `file()` = many entries from one JSON/YAML file. |
| **Schema** | A Zod object validating each entry's frontmatter *at build time*. A typo fails the build rather than rendering `undefined`. |
| **Entry** | `{ id, data, body, filePath }`. `id` is the slug, derived from the filename. `data` is the validated frontmatter. |
| **`reference()`** | A schema field holding a *typed link* to an entry in another collection. Validated — a reference to a non-existent entry fails the build. |
| **`render(entry)`** | Returns `{ Content, headings }` for rendering an entry's body. Called in the page, not the schema. |

The build-time validation is the reason to invest in schemas at all: a broken tag reference
or a missing date becomes a failed build with a filename, not a blank space on a live page.

### Two kinds of validation failure, verified in Phase 1

They behave differently, and the difference matters when debugging:

**Schema failures** (wrong type, missing field, failed `.refine()`) are clean, fatal, and
name the file and the custom message:

```
[InvalidContentEntryDataError] writing → notes-on-content-modelling
data does not match collection schema.
  coverAlt: coverAlt is required when cover is set. Use an empty string for
            purely decorative images.
```

**Reference failures** are messier. A bad `reference('tags')` logs a clear error at sync:

```
[ERROR] [content] Invalid content reference: entry "starting-again" in collection
"writing" (field: tags[0]) references "astroo" in collection "tags", but that
entry does not exist.
```

…but **sync does not halt there.** The build continues, and `getEntries()` then returns
`undefined` for the missing entry, so the *fatal* error is a downstream
`TypeError: Cannot read properties of undefined (reading 'data')` pointing at a bundled chunk.

The build does fail — nothing broken ships — but the error you see last is not the error that
matters. **When a build dies on an undefined `.data`, scroll up to the first `[content]`
ERROR line.** That's the real one, and it names the file and field.

---

## 3. The collections

Five collections. Pages (`/about`, `/404`) stay as plain `.astro` routes — a collection for
a single About page is overhead with no payoff.

```
Collection   Loader          Body        Purpose
──────────   ─────────────   ─────────   ─────────────────────────────────────
tags         file()          –           Controlled vocabulary
writing      glob(*.mdx)     long        Articles, incl. external link-posts
projects     glob(*.mdx)     long        Case studies; link to writing series
notes        glob(*.md)      short       Microblog thoughts, optional link out
stash        glob(*.md)      short       Books/film/music/games, w/ review
```

```
Routes
──────
/                       homepage — projects, then writing, then stream slice
/writing                index + tag filters
/writing/[id]           post page (internal posts only)
/projects               index
/projects/[id]          case study + its writing series
/notes                  notes feed          (stream-only, no permalinks)
/stash                  stash feed          (stream-only, no permalinks)
/about, /colophon, /404 static
```

**Only `writing` and `projects` have dynamic routes.** Notes and Stash are stream-only by
decision — they render inline in feeds and are never individually addressable. This is worth
stating plainly because it removes two route files, two layouts, and the question of what a
single-note page would even contain. Reversible later: adding `/notes/[id]` needs one route
file and no data changes.

### 3.1 Shared field groups

Not everything shares the same base — Notes have no intro and often no title, Stash's
"title" is the work's title. So rather than one inherited base schema, use **composable
field groups** spread into each collection. Zod v4 spreads cleanly as plain objects.

```ts
// src/content/fields.ts
import { z } from 'astro/zod';
import { reference } from 'astro:content';
import type { ImageFunction } from 'astro:content';

/** On every collection. */
export const baseFields = {
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

/** Cover image. Kept as a factory because image() comes from schema context. */
export const coverFields = (image: ImageFunction) => ({
  cover: image().optional(),
  coverAlt: z.string().optional(),
});
```

`z.coerce.date()` is deliberate. YAML parses an unquoted `2026-08-23` into a Date already,
but a quoted `"2026-08-23"` stays a string — `coerce` accepts both, so frontmatter style
never becomes a build error.

> **Note on `coverAlt`:** it is optional in the schema but should be treated as required by
> convention whenever `cover` is set. Zod *can* enforce that pairing with a `.refine()`, and
> that's worth adding in Phase 1 — a decorative-only cover can pass `coverAlt: ""`
> explicitly.

### 3.2 `tags` — controlled vocabulary

A single file, loaded with `file()`. No tag pages are generated; this collection exists so
that tag references are validated and so filter UI has display names to show.

```jsonc
// src/content/tags.json
{
  "design-systems": { "name": "Design Systems" },
  "accessibility":  { "name": "Accessibility", "description": "…" },
  "astro":          { "name": "Astro" }
}
```

Object-keyed form means the key *is* the entry `id`, so `reference('tags')` resolves against
it directly.

**One vocabulary, not one per collection.** A "sci-fi" tag on a Stash book and on a Writing
post is the same tag. Each filter UI derives its options from the tags *actually in use* in
that collection, so `/writing` never offers a filter that returns nothing. Stash's
medium-specific metadata (`creator`, `medium`) is *not* tags — it's structured fields, below.

Adding tag pages later needs one new route file and zero data changes.

### 3.3 `writing`

```ts
schema: ({ image }) => z.object({
  ...baseFields,
  ...titledFields,
  ...coverFields(image),
  externalUrl: z.string().url().optional(),
  externalSource: z.string().optional(),   // e.g. "Smashing Magazine"
})
```

An **external post** is an `.mdx` file with frontmatter and an empty body. It sits in the
same collection, sorts and filters with everything else, and differs at exactly two points:

1. **Preview link** — `externalUrl ?? \`/writing/${id}\``, with an external-link affordance
   and the `externalSource` shown as "on Smashing Magazine".
2. **Route generation** — `getStaticPaths()` filters out entries with an `externalUrl`, so
   no empty page is built for them.

**Honest limitation:** Zod validates frontmatter only — it cannot see the body, so it cannot
enforce "has a body *or* an `externalUrl`". A post with neither would build as a blank page.
This gets enforced in the view layer instead, as a build-time assertion (Phase 2).

### 3.4 `projects`

```ts
schema: ({ image }) => z.object({
  ...baseFields,
  ...titledFields,
  ...coverFields(image),
  url: z.string().url().optional(),        // the live project
  repoUrl: z.string().url().optional(),
  role: z.string().optional(),
  year: z.number().int().optional(),
  tech: z.array(z.string()).default([]),
  relatedWriting: z.array(reference('writing')).default([]),
})
```

**`relatedWriting` is an ordered array, and it is the single source of truth for the
relationship.** This is the important call. The alternative — a `project` field on each
Writing post — looks symmetrical but is worse:

- Series **order** is data, not something derivable. A five-part tutorial isn't necessarily
  in publish-date order, and "Part 3 of 5" needs an explicit index. An array gives that for
  free; a back-reference would need a separate `partNumber` field kept in sync with nothing
  validating it.
- Storing both directions means two files to update per link, and nothing catches a
  half-updated pair.

The reverse lookup ("this post belongs to project X, part 3 of 5") is **derived** in the
view layer by scanning projects once. One source of truth, both directions available.

Resolving the array uses `getEntries()`:

```ts
const series = await getEntries(project.data.relatedWriting);
```

Projects are excluded from the Writing feed entirely — they're a separate collection, so
this is automatic rather than something to filter for.

### 3.5 `notes`

```ts
schema: z.object({
  ...baseFields,
  title: z.string().optional(),   // often untitled
  url: z.string().url().optional(),
  urlLabel: z.string().optional(),
})
```

`.md`, not `.mdx` — notes need links and emphasis, not components. No cover image, per the
requirement.

**On the character limit: convention only — decided.** Zod can't see the body, so `.max()`
can't apply to it, and no build-time check will be added. Notes stay real Markdown (inline
links matter for the "recommending an article" case) and length is a matter of discipline.

The practical consequence is that **the feed layout must not assume short notes.** Since
nothing enforces brevity, `FeedItem` styling needs to degrade gracefully if a note runs long
— no fixed heights, no clamped containers that would clip text. Cheap to honour if it's
designed in from the start, annoying to retrofit.

Notes are **stream-only** — no `/notes/[id]` permalinks. They appear inline in the `/notes`
feed and in the homepage stream slice.

### 3.6 `stash`

Genuinely different metadata, hence its own collection.

```ts
schema: ({ image }) => z.object({
  ...baseFields,
  title: z.string(),                        // title of the work
  medium: z.enum(['book','film','tv','album','game','podcast','article']),
  creator: z.array(z.string()).default([]), // author / director / artist
  year: z.number().int().optional(),        // year of the work, not of logging
  url: z.string().url().optional(),
  rating: z.number().min(1).max(5).optional(),
  recommended: z.boolean().default(false),
  ...coverFields(image),
})
```

Notes on the shape:

- **One `creator` field, not `author`/`director`/`artist`.** The label is presentational and
  derives from `medium` (`book → "by"`, `film → "dir."`, `album → "by"`). Three fields would
  mean three optional fields of which exactly one is ever set.
- **`year` vs `publishDate`** are different things and both are needed: the year the book was
  published, and the date you logged it. The feed sorts on `publishDate`.
- **`cover` is central here** — movie posters, album art, book covers. Unlike Writing, where
  a cover is optional decoration, the artwork *is* the primary visual content of a Stash
  entry. Worth considering a portrait-biased aspect ratio for these, distinct from Writing's
  landscape covers, since posters and book jackets are tall.

Stash entries are **stream-only** — no `/stash/[id]` permalinks, matching Notes, so the two
behave identically when interleaved in a shared feed.

---

## 4. The view layer

`src/lib/content.ts`. Every page imports from here; no page calls `getCollection()` directly.

### 4.1 Draft and sort handling, once

```ts
const isVisible = (entry: { data: { draft: boolean } }) =>
  import.meta.env.PROD ? !entry.data.draft : true;

const byNewest = (a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf();

export async function getWriting() {
  return (await getCollection('writing')).filter(isVisible).sort(byNewest);
}
```

Drafts stay visible in `dev` and vanish in `build`, which is what you want while writing.
Because this is the only place the filter exists, it cannot be forgotten on a new page.

`isPublished` and `byNewest` are generic over `baseFields`, so Projects, Notes, and Stash
reuse them unchanged — there is one draft rule and one sort rule for the whole site.

> **Caveat: build-time assertions only run if a page calls them.** `assertRenderable()` fires
> from inside `getWriting()`, so it catches nothing on a build where no page happens to call
> `getWriting()`. From Phase 4 onward the homepage and `/writing` both call it on every build,
> so it's always live — but it is not a linter, and it can't be relied on before then.

> **Dev server caches the content store.** A dev server started *before* `content.config.ts`
> existed will serve zero entries and give no hint why. After changing collection config,
> restart it (`astro dev stop && astro dev --background`). Costly minutes if you don't know.

### 4.2 The combined Notes + Stash feed

This is where "collections are storage, feeds are views" pays off. Normalise both into a
common shape *for ordering and layout*, while keeping the original entry for rendering:

```ts
export type FeedItem =
  | { kind: 'note';  date: Date; tags: string[]; entry: CollectionEntry<'notes'> }
  | { kind: 'stash'; date: Date; tags: string[]; entry: CollectionEntry<'stash'> };

export async function getStream(): Promise<FeedItem[]> {
  const [notes, stash] = await Promise.all([getNotes(), getStash()]);
  return [
    ...notes.map((entry) => ({ kind: 'note',  date: entry.data.publishDate, … })),
    ...stash.map((entry) => ({ kind: 'stash', date: entry.data.publishDate, … })),
  ].sort(byNewest);
}
```

A discriminated union, so a `<FeedItem>` component switches on `kind` and TypeScript narrows
`entry` to the right type — full autocomplete on `medium` inside the stash branch, and a
compile error if you reference `medium` in the note branch. The two collections keep their
own honest schemas; only the *view* is unified.

### 4.4 Homepage composition

Three distinct sections, not one merged list, **in this order**:

1. **Projects** — `getProjects()`, sliced. Leads the page: this is a portfolio, so the work
   comes before the writing about the work.
2. **Latest Writing** — `getWriting()`, sliced.
3. **A slice of the Notes/Stash stream** — `getStream({ limit: n })`.

Projects leading has a knock-on effect worth planning for: it's the first thing a visitor
sees, so project cover images are doing the heaviest lifting on the site and should be
treated as a first-class asset rather than an afterthought. It also means Phase 6 (Projects)
is more load-bearing than its position in the order suggests — the homepage is incomplete
until it lands.

Keeping these separate rather than interleaving everything is deliberate. Each has different
visual weight, and a long-form article sitting between a one-line note and a film rating
reads as noise. Separate sections also mean a new post or project can never be buried under a
week of notes — each section is its own guaranteed slot.

Two consequences worth noting:

- **`FeedItem`'s union stays two-armed** (`note | stash`). Only the stream needs
  normalisation; Writing and Projects render through their own preview components. If they
  ever do need to interleave, adding an arm is additive and TypeScript will flag every
  `switch` that needs a new branch.
- **Three preview components, not one generic one.** `WritingPreview`, `ProjectPreview`, and
  `FeedItem` are separate. A single configurable preview that handles four content types via
  props tends to accumulate conditionals until it's harder to read than the three components
  it replaced — and these genuinely differ (Projects lead with cover art and tech, Writing
  with title and intro). Shared *styling* is the layer to reuse, not a shared component.

### 4.3 Derived project ↔ writing relations

```ts
/** Map of writing id → { project, part, total }, derived from projects. */
export async function getWritingSeriesIndex() { … }
```

Built once, consumed by the Writing post page to render "Part 3 of 5 in *Building X*".

---

## 5. Directory layout

```
src/
  content.config.ts          # collection definitions (NOT src/content/config.ts — legacy)
  content/
    fields.ts                # shared field groups
    tags.json
    writing/*.mdx
    projects/*.mdx
    notes/*.md
    stash/*.md
  lib/
    content.ts               # the view layer
  components/
    WritingPreview.astro
    FeedItem.astro
    TagFilter.astro
  layouts/
    Base.astro
    Post.astro
  pages/
    index.astro
    about.astro
    colophon.astro
    404.astro
    writing/index.astro
    writing/[...id].astro
    projects/index.astro
    projects/[...id].astro
    notes.astro
    stash.astro
```

**Colophon.** A static page describing the tools and decisions behind the site. Mostly hand
written prose, but the dependency list can generate itself — an Astro frontmatter block can
`import pkg from '../../package.json'` and render the real versions, so the page can't drift
out of date the way a hand-maintained list would. Worth doing; it's about four lines.

Images live beside their posts in `src/content/` (or `src/assets/`) — **not** `public/`.
Only files under `src/` go through Astro's image pipeline for resizing, `webp`/`avif`
conversion, and automatic `width`/`height` (which prevents layout shift). Files in `public/`
are copied verbatim and get none of that.

---

## 6. Implementation phases

Small and independently verifiable, so each one can be understood before the next.

| Phase | Scope | Done when |
|---|---|---|
| **0** | ✅ `.gitignore`; `astro add mdx`; directory skeleton; `Base.astro`; empty `global.css` | Done — `astro build` passes, homepage renders |
| **1** | ✅ `tags.json`; `fields.ts`; `content.config.ts`; `writing` + 3 sample posts | Done — entries load, refs resolve, both failure modes verified |
| **2** | ✅ `src/lib/content.ts` — `getWriting()`, draft filter, sort, renderable assertion | Done — dev 4 / prod 3, order correct, assertion fires |
| **3** | `/writing/[...id]` route + `Post.astro`; external posts correctly excluded | Internal posts render; external ones 404 by design |
| **4** | `WritingPreview.astro`; wire into `/writing` index and homepage | Both post kinds preview identically, link differently |
| **5** | Tag filter UI on `/writing` | Filtering works; options derive from tags in use |
| **6** | `projects` collection, `[...id]` route, `ProjectPreview`, series list, derived reverse lookup | Project page lists its series; posts show "Part n of m" |
| **7** | `notes` collection + `/notes` feed + `FeedItem` | Notes feed renders |
| **8** | `stash` collection + `/stash`; `getStream()` combined feed | Notes and Stash interleave correctly by date |
| **9** | Homepage assembled: projects, writing, stream slice | All three sections live in order |
| **10** | `/about`, `/colophon`, `/404`; RSS, sitemap, OG images | — |

Phases 1–2 are the ones worth going slowly on — everything after reuses their patterns.

Note that the **homepage can't be finished until Phase 9**, since it depends on Projects
(Phase 6) and the stream (Phase 8). Until then `/` stays a stub showing Writing only. That's
a deliberate consequence of building collections in dependency order rather than
page-by-page; the alternative is rewriting the homepage three times.

---

## 7. Decisions log

All resolved. Recorded here because the *reasoning* is what's worth keeping — the conclusions
are already reflected in the sections above.

| Decision | Resolution |
|---|---|
| Note permalinks | **Stream-only.** No `/notes/[id]`. Reversible with one route file. |
| Note length rule | **Convention only.** No build check. Feed layout must therefore tolerate long notes. |
| Stash cover images | **Yes, and central** — posters, album art, jackets. Consider a portrait ratio. |
| Homepage composition | **Three sections: Projects, Writing, stream slice** — in that order. |
| Stash permalinks | **Stream-only**, matching Notes, so the two interleave identically. |
| External Writing posts | **Same collection** as internal, distinguished by `externalUrl`. |
| Tag vocabulary | **One shared `tags` collection**; no tag pages; filters derive options from tags in use. |
| Project ↔ Writing link | **Ordered array on the Project only**; reverse lookup derived. |
| Preview components | **Three separate** (`WritingPreview`, `ProjectPreview`, `FeedItem`), sharing styles not structure. |
