# Content Architecture

Plan for the content model of the portfolio site. Written against **Astro 7.2.4**, which
uses the Content Layer API with **Zod 4.4.3**.

> **Import `z` from `astro/zod`, not `astro:content`.** Astro 7 deprecates
> `import { z } from 'astro:content'` — it still works but is slated for removal. Most
> tutorials online still show the old form. `reference`, `defineCollection`, `getCollection`,
> `getEntries`, and `render` all still come from `astro:content`; only `z` moved.

Status: **Phases 0–8 implemented.** Phases at the bottom.

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
that collection (`getTagsInUse()`), so `/writing` never offers a filter that returns nothing,
and the vocabulary can hold tags reserved for future use without them showing as dead buttons.
Stash's medium-specific metadata (`creator`, `medium`) is *not* tags — it's structured fields,
below.

Adding tag pages later needs one new route file and zero data changes.

### Filtering behaviour (Phase 5)

Client-side, on `/writing`. No page-per-tag.

- **Every post is rendered server-side**; filtering only toggles the `hidden` attribute. The
  full list stays crawlable, and `hidden` needs no CSS to work — it's a UA default style,
  which matters while `global.css` is empty.
- **Multiple tags combine with OR, not AND.** Selecting Astro and Design Systems shows posts
  matching either. Tags are a broadening tool; AND mostly yields empty results as a vocabulary
  grows. Worth revisiting only if the tag list gets large enough that OR stops narrowing
  usefully.
- **No-JS baseline:** the filter UI ships with `hidden` and the script removes it. A control
  that does nothing is worse than no control, so without JS visitors get the complete
  unfiltered list and no broken buttons.
- **State lives in the URL** (`?tag=astro&tag=design-systems`) via `history.replaceState`, so
  a filtered view is shareable and survives reload. Unknown tags — a hand-edited address, or a
  tag later removed from the vocabulary — are ignored *and stripped from the URL on load*, so
  a shared link never claims a filter that isn't applied.
- **Changes are announced.** A `role="status"` live region reports "Showing 3 of 4 posts,
  tagged: …". Filtering is otherwise a silent visual change, leaving a screen reader user with
  no signal anything happened. Hidden items also leave the accessibility tree entirely, which
  is the correct behaviour and was verified in the browser.

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
  url: z.url().optional(),                 // the live project
  repoUrl: z.url().optional(),
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

### Why not a `series` field on each post?

Considered in Phase 6 and rejected. The idea is appealing — give posts a shared
`series: "lattice"` key and let them auto-associate — but it does not avoid the ordering
problem, it relocates it. Posts sharing a key still need an order, and publish-date order is
the wrong one for a tutorial: a part can be finished late or backdated without moving in the
reading order. So a `seriesPart: 3` field follows, and now nothing validates that two posts
don't both claim part 3, or that part 2 exists at all.

The array already delivers the auto-association that motivated the idea — **posts declare
nothing**, and `getWritingSeriesIndex()` derives position — with order for free and every
entry validated by `reference()`. Verified in Phase 6: the three Lattice posts render as
parts 1–3 in the order the project lists them, while `/writing` shows the same three in a
different order by date.

The one thing it cannot express is a series with **no project attached**. If that's ever
needed, it's additive: a `series` collection with the same ordered-array shape, and
`getWritingSeriesIndex()` merging both sources. No change to any post.

### Drafts inside a series

`getProjectSeries()` filters drafts, so part numbering is always over the posts a reader can
actually reach. A draft at position 2 of 4 would otherwise render a visible "Part 3 of 4"
linking to a part 2 that doesn't exist in production. Verified: drafting a mid-series post
renumbers the survivors to 1 of 2 and 2 of 2.

### Two build-time guards (Phase 6)

Both throw with the offending ids named, in the spirit of `assertRenderable()`:

- **A post listed by two projects** — "part n of *which*?" is ambiguous, so it's an error
  rather than a silent last-writer-wins.
- **A `relatedWriting` reference that doesn't resolve** — `getEntries()` returns `undefined`
  for these and Astro's own error scrolls away (§2), so `getProjectSeries()` names the
  project and the missing ids itself.

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
  url: z.url().optional(),        // z.url(), not z.string().url() — see §2
  urlLabel: z.string().optional(),
}).refine((data) => !data.urlLabel || data.url, {
  message: 'urlLabel is meaningless without url.',
  path: ['urlLabel'],
})
```

`.md`, not `.mdx` — notes need links and emphasis, not components. No cover image, per the
requirement.

The `urlLabel` refine mirrors the `externalSource`/`externalUrl` pairing on `writing`: an
optional field that decorates another optional field is silently dead if its partner is
missing, and silently dead frontmatter is worth a build error.

**A note must have a body.** `getNotes()` asserts it, the same class of check as
`assertRenderable()` and for the same reason — a schema never sees the body. Notes get no
`externalUrl`-style escape hatch though: a link with no words is a bookmark, and since there
is no permalink for it to be empty on, it would render as a blank item mid-feed.

**Filenames are `YYYY-MM-DD-slug.md`.** Most notes are untitled, so there is no title to
derive a filename from, and the id never appears in a URL — it only shows up in build errors.
A date prefix keeps the directory in reading order and makes those errors locatable.

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
  url: z.url().optional(),
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

**All five fields are filter facets** — see §4.5 for the mechanism. `medium`, `tag` and
`creator` are `one-of`, `rating` is `at-least`, `recommended` is a `flag`, and they combine
with AND.

**The creator-spelling guard.** `creator` is free text, so unlike `tags` there is no
`reference()` validating it, and two spellings of one person become two facet values that
each match one item. Nothing errors; the filter just quietly under-reports.
`assertConsistentCreators()` groups every creator string by an aggressive key — case folded,
diacritics stripped, all non-alphanumerics removed — and throws if one key has more than one
spelling, naming each spelling and the entries it appears in:

```
Stash creators spelled inconsistently:
  - "Ursula K. Le Guin" in the-dispossessed
  - "Ursula K Le Guin" in tmp-dup

  - "Ken Burns" in the-vietnam-war
  - "KenBurns" in tmp-dup
These filter as separate people. Pick one spelling and use it everywhere.
```

It catches both failure shapes: spellings that produce the *same* slug (so the facet works
but the displayed name is inconsistent between entries), and spellings that produce
*different* slugs (so the facet genuinely splits one person in two). Same class of check as
`assertRenderable()` and `assertNotesHaveBody()` — the thing the schema structurally cannot
see.

What it deliberately does not catch is a genuinely different name for the same person —
"Ursula K. Le Guin" vs "Ursula Le Guin" are different names, not variant spellings, and no
normalisation can tell that from two real people. That would need an alias map, which is a
controlled vocabulary by another name and was rejected for the same reasons.

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

> **Build-time assertions only run if a page calls them.** `assertRenderable()` fires from
> inside `getWriting()`, so it catches nothing on a build where no page calls `getWriting()`.
> ✅ Live as of Phase 4 — both `/` and `/writing` call it on every build. Still not a linter:
> if those two pages ever stop calling it, the check goes quiet without any warning.

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
  return [...await getNoteFeed(), ...await getStashFeed()].sort(byNewestItem);
}
```

A discriminated union, so a `<FeedItem>` component switches on `kind` and TypeScript narrows
`entry` to the right type — full autocomplete on `medium` inside the stash branch, and a
compile error if you reference `medium` in the note branch. The two collections keep their
own honest schemas; only the *view* is unified.

**As built.** The union gained its stash arm in Phase 8; `getStream()` is now a concatenate
and re-sort, and `FeedItem.astro` branches on `kind`:

- **The branch is smaller than expected**, because `render()`, `resolveTags()`, the
  `<article>` chrome, the date and the tag list are all shared. Only the head differs —
  cover art, a linked title and `StashMeta` for stash, a plain optional heading for a note —
  plus a note's link-out line. The stash metadata went into its own component, matching
  `ProjectMeta`, rather than swelling the branch.
- **The body is shared but optional for only one kind.** A note must have a body; a stash
  entry logged with a rating and no review is legitimate, so `FeedItem` gates on
  `entry.body?.trim()` rather than assuming.
- **`url` means different things per kind, so it renders differently.** A stash entry's url
  *is* the work, so the title becomes the anchor. A note's url is a link *out* from the note
  and keeps its own line below the prose.

**As originally built in Phase 7**, with one arm and no `getStream()`:

- Each collection owns its own `get…Feed()` that normalises its entries. `getStream()` is
  then concatenate-and-sort and nothing else, which is the point of normalising.
- **`byNewestItem`, not `byNewest`.** The normalised shape has a flat `date`; `byNewest`
  reads `data.publishDate`. Two comparators because there are genuinely two shapes — an
  earlier draft of this document called `byNewest` here and it would not have compiled.
- **`FeedItem.astro` renders the body, not a preview of it.** No permalink means the feed
  *is* the note: there is nowhere else for the content to live, nothing to link a title to,
  and `render()` is called per item inside the component rather than by the page.
- The component does **not** yet switch on `kind`. With one arm that would be a branch
  pretending to be a seam. The discriminant is on the type, so Phase 8 adds a branch rather
  than reshaping anything.

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
- **One long-form layout, two optional slots.** `Post.astro` is shared by writing posts and
  project case studies. Rather than a fourth prop cluster or a near-duplicate `Project.astro`,
  it exposes `meta` (in the header — project facts and links out, or a post's "part n of m"
  line) and `related` (after the body). Both render nothing when unfilled, so a plain writing
  post is unaffected. Preview *components* stay separate; the layout is where sharing pays.
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

`total === 1` means *related*, not "part 1 of 1" — the post page renders "Written for
*Project*" with no numbering, and `SeriesList` renders a single link rather than a
one-item `<ol>`. Same data, one presentational branch.

### 4.5 Faceted filtering

`src/scripts/facet-filter.ts`, shared by `/writing`, `/notes` and `/stash`. Generalised out
of the single-facet script Phase 5 left inline in `/writing/index.astro`, once it was clear
that Notes wanted filters and Stash wanted five of them.

Two combining rules, and the second is the whole reason for the rewrite:

- **OR within a facet.** Tag "Astro" or "Process" shows either. Tags broaden; AND mostly
  yields nothing as a vocabulary grows.
- **AND across facets.** Medium "Film" and genre "Sci-fi" means sci-fi films. OR across
  facets would mean every film *plus* every sci-fi book, which nobody selecting both intends.

Three match modes, declared per facet rather than special-cased:

| Mode | Semantics | Used by |
|---|---|---|
| `one-of` (default) | item's values intersect the active set | tag, medium, creator |
| `at-least` | numeric value ≥ threshold; single-valued | rating |
| `flag` | value is `true` | recommended |

**Facets are discovered from the items, not from the controls.** The script scans
`data-facet-*` on each item and builds the known value set from what is actually present.
Two things fall out of that:

- A button for a value no item has can never be rendered, extending the `getTagsInUse()`
  guarantee to every facet.
- **A facet needs no buttons at all.** This is what makes `creator` workable. Rendering a
  button per director and musician would mean an unbounded list of proper nouns — a phone
  book, not a filter — so instead the creator's name *in the entry* is the control:
  `dir. Denis Villeneuve` links to `?creator=denis-villeneuve`. The facet is discovered
  through the content rather than presented up front.

Values in a URL are validated against the items too, so a hand-edited or stale address drops
the unknown parts and rewrites itself rather than silently claiming a filter it hasn't
applied.

#### Availability: what greys out, and what must not

An option that would return nothing is marked unavailable rather than left to disappoint.
The rule is one line, and the subtlety is in which selections it counts against:

> **A value's count is computed against every *other* facet, ignoring its own facet's
> current selection.**

That falls out of OR-within/AND-across rather than being a separate policy. Values inside a
facet are ORed, so choosing "Film" must *not* grey out "Book" — you can have both, and the
result is films plus books. But "Horror" is a genre spanning both, so once "Film" is chosen
it should grey out if no film is tagged horror. Excluding the facet from its own count gives
exactly that, with no hand-maintained map of which facets interact.

Verified against the fixture — with **Film** selected:

```
Medium  Film 2 ✓on   Book 1        Album 1      ← same facet, all stay live
Genre   Sci-fi 1     Drama 1       Jazz 0 dead  ← no film is jazz
Rating  5: 1         4+: 1         3+: 2
```

Two rules keep it from trapping anyone:

- **An active value is never marked unavailable**, or there would be no way to switch it off.
  A dead end reached by URL (`?tag=jazz&medium=film`) shows the empty state with both
  selections still live, so one click escapes it.
- **`aria-disabled`, never the `disabled` attribute.** A disabled control drops out of the
  tab order and most screen reader listings, so a non-sighted user cannot discover the option
  exists at all — they just get a shorter list than everyone else. `aria-disabled` keeps it
  focusable and announced, and the click handler is what declines. Counts are rendered as
  text rather than conveyed by styling alone.

This makes the empty state rare rather than unnecessary — it is still reachable through a
shared or hand-edited URL, so it stays.

#### The controls are not part of the contract

The script binds to **anything** carrying `data-facet` and `data-value` — checkbox, radio,
button, or link — and reflects state by `checked` on inputs and `aria-pressed` on everything
else. Presentation is therefore free to change without touching the filtering logic.

What `FacetFilter.astro` currently renders, and why:

- **A native `popover` per facet**, opened by a `<button popovertarget>`. The browser handles
  light-dismiss, top-layer stacking and focus — the parts hand-rolled menus reliably get
  wrong. The trigger shows a count of that facet's active values.
- **Checkboxes for `one-of`, radios for `at-least`**, inside a `<fieldset>` with a `<legend>`.
  These are what the controls genuinely *are* — independent on/off choices, and a
  one-from-many choice — so grouping, keyboard behaviour and state announcement come free
  rather than being reconstructed with `aria-pressed` on a row of buttons.
- **An "Any" radio** on single-valued facets, since a radio group cannot be unset by clicking
  and the global clear-all is too blunt for one facet.

A creator link inside an entry (`Denis Villeneuve` → `?creator=denis-villeneuve`) is an
*additional* entry point, not the mechanism. It answers a different question — "more by this
person", asked while reading — and is orthogonal to the menu, which answers "narrow this
list". Either can exist without the other.

**Markup contract** (was implicit in Phase 5, written down now that three pages depend on it):

```
[data-facet-filter]                    controls root, hidden until JS reveals it
  [data-facet-group="<name>"]            optional [data-facet-mode]
    [data-facet-trigger]                   optional; may hold [data-facet-active-count]
    [data-facet][data-value]               any element; data-value="" means "no filter"
      [data-facet-text]                    label text, for the status region
      [data-facet-count]                   filled with the availability count
[data-facet-clear]                     one clear-all control
[data-filterable-list]                 optional [data-filter-noun="post"]
  :scope > li[data-facet-<name>]         space-separated values
[data-filter-status]                   role="status" live region
[data-filter-empty]                    shown when nothing matches
```

> **`:scope >`, not a descendant selector.** Previews render their own `<ul>` of tag chips,
> so `querySelectorAll('li')` counts every chip as a filterable item — "1 of 19" on a page of
> seven posts — and hides the chips whenever a filter is active. Caught in testing during the
> Phase 7 extraction; the Phase 5 version was accidentally safe because it selected
> `li[data-tags]`.

**Cost, for the record.** Availability is recomputed for every option on every change:
`items × facets × values`. At the scale of a personal site — tens of items, low tens of
options — that is microseconds, and the code stays a plain loop instead of an index that
has to be invalidated. Revisit only if the Stash grows into the thousands.

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
    format.ts                # date formatting
    images.ts                # cover <Image> props + the vector guard
    facets.ts                # filter group shapes + the shared tag facet
  scripts/
    facet-filter.ts          # client-side faceted filtering (§4.5)
  components/
    WritingPreview.astro
    ProjectPreview.astro
    ProjectMeta.astro
    SeriesList.astro
    FeedItem.astro
    StashMeta.astro
    FacetFilter.astro
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

> **Don't give an SVG cover a `widths` array.** Discovered in Phase 3: `<Image widths={[480,
> 800, 1200]}>` on a vector emits three byte-identical copies under different hashes and a
> `srcset` that can never do anything, since vectors scale for free. This mattered only
> because the sample cover is an SVG — real photographic covers want the full srcset — but the
> guard is correct to keep either way. As of Phase 6 it lives in `lib/images.ts` as
> `coverImageProps(cover, widths, sizes)`, spread into `<Image>`, so it isn't re-derived in
> every component with a cover.

### ⚠️ Revisit: `widths` and `sizes` are placeholders

`Post.astro` currently declares `widths={[480, 800, 1200]}` and
`sizes="(min-width: 60rem) 60rem, 100vw"`. **Both numbers were invented before any design
existed and must be revisited once the responsive layout is settled.** They are not sensible
defaults — they are guesses that happen to build.

Why it matters more than it looks:

- **`sizes` must describe the real layout.** It tells the browser how wide the image will
  actually be drawn, and the browser trusts it completely. Overstate it and every visitor
  over-downloads on every page; understate it and images render soft. A wrong `sizes` fails
  silently — nothing errors, the page just costs more or looks worse.
- **Device pixel ratio multiplies the requirement.** The browser picks a candidate using
  `display width × DPR`, so a 960px-wide image on a 2× retina screen needs a **1920px**
  candidate. With 1200 as the current ceiling, retina laptops already get a soft image.
  Rule of thumb: the top of the `widths` array should be about **max display width × 2**.
  (2× rather than 3× — file size grows with the square of width, and the gain above 2× is
  marginal even on 3× phones.)
- **`densities` is the better prop for fixed-size images** — avatars, logos, anything always
  drawn at one size. `widths` and `densities` are mutually exclusive in Astro's types
  (`densities?: never`), so this is an either/or per image, decided by whether the display
  size is fluid or fixed.

Applies to every `<Image>` added from here on, not just `Post.astro`. `ProjectPreview.astro`
now carries a second set of guesses (`[400, 800, 1200]`, `(min-width: 60rem) 30rem, 100vw`)
against a card grid that does not exist yet — and since Projects lead the homepage, those
covers are the heaviest assets on the site, so that pair matters more than `Post.astro`'s.
`FeedItem.astro` adds a third (`[240, 480, 720]`, `(min-width: 60rem) 16rem, 40vw`),
deliberately narrower because stash art is portrait — jackets and posters are tall, so the
same displayed height needs far fewer pixels of width than a landscape cover.

**Three placeholders to revisit now.** They should be settled together once the layout
exists, since they are three answers to one question.

> **HTML comments in `.astro` templates ship to the browser.** `<!-- … -->` is real markup;
> only `{/* … */}` is compiled away. Harmless in a layout, wasteful in anything repeated —
> the note in `FeedItem` was being emitted once per feed entry. Converted there and in
> `WritingPreview`; worth remembering for any comment inside a `.map()`.

### ✅ Resolved: the tag filter script is no longer trapped in one page

Phase 5 put the filtering script inline at the bottom of `/writing/index.astro`, which was
right at the time — one page needed it. It came out in Phase 7.5 as `facet-filter.ts`, and
generalised rather than merely moved, because the second and third consumers turned out to
need more than one facet. See §4.5 for the model and the markup contract.

Worth keeping as a pattern: the extraction happened *with* the second consumer, and the
generalisation was designed against the third's requirements while there was still exactly
one copy to change.

---

## 6. Implementation phases

Small and independently verifiable, so each one can be understood before the next.

| Phase | Scope | Done when |
|---|---|---|
| **0** | ✅ `.gitignore`; `astro add mdx`; directory skeleton; `Base.astro`; empty `global.css` | Done — `astro build` passes, homepage renders |
| **1** | ✅ `tags.json`; `fields.ts`; `content.config.ts`; `writing` + 3 sample posts | Done — entries load, refs resolve, both failure modes verified |
| **2** | ✅ `src/lib/content.ts` — `getWriting()`, draft filter, sort, renderable assertion | Done — dev 4 / prod 3, order correct, assertion fires |
| **3** | ✅ `/writing/[...id]` + `Post.astro` + `lib/format.ts` + `resolveTags()` | Done — internal 200, external 404 by design |
| **4** | ✅ `WritingPreview.astro`; `/writing` index; homepage Writing section | Done — both kinds preview identically, link differently |
| **5** | ✅ `TagFilter.astro` + client-side filtering on `/writing` | Done — multi-select OR, URL-synced, no-JS safe (superseded by 7.5) |
| **6** | ✅ `projects` collection, `[...id]` route, `ProjectPreview`, `SeriesList`, derived reverse lookup, homepage Projects section | Done — series renders in array order, posts show "Part n of m", both guards fire |
| **7** | ✅ `notes` collection, `/notes` feed, `FeedItem`, `getNoteFeed()` normalisation | Done — dev 6 / prod 5, both guards fire, long note renders unclipped |
| **7.5** | ✅ `facet-filter.ts` + `FacetFilter.astro` + `lib/facets.ts`; `/writing` migrated, `/notes` filtered | Done — three modes, AND across / OR within, availability counts, link-driven facet, empty state |
| **8** | ✅ `stash` collection, `/stash`, `StashMeta`, `getStream()`, creator-spelling guard, `FeedItem` union widened | Done — stream interleaves strictly by date, five facets combine, guard names both spellings |
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
| A `series` field on posts | **No.** It relocates the ordering problem rather than solving it, and the array already gives auto-association. Project-less series are additive later. |
| Series list on a project page | **A `<nav>` landmark after the body**, not part of the prose — it is onward navigation about the project, not more case study. |
| Layout for case studies | **`Post.astro` shared**, with optional `meta` and `related` slots. |
| Preview components | **Three separate** (`WritingPreview`, `ProjectPreview`, `FeedItem`), sharing styles not structure. |
| Link text for a note's `url` | **`urlLabel`, falling back to the host.** "docs.astro.build" is tidier than the raw URL and more honest than a generic "read it" — the reader sees where they're going. |
| Naming an untitled note | **`aria-label="Note — {date}"` on the `<article>`.** Untitled is the common case, which otherwise leaves an unnamed article in a screen reader's element list. Titled notes get no label; the heading already names them. |
| Tag filtering on `/notes` | **Yes**, once the script was extracted in 7.5. |
| Genre as tags | **Yes** — same shared vocabulary. `getTagsInUse()` derives options per page, so `/writing` never offers "Horror" and `/stash` never offers "Astro". |
| Creator as tags | **No.** Unbounded proper nouns would turn a curated vocabulary into hundreds of single-use entries. Free-text field, guarded against near-duplicate spellings instead. |
| Creator filter UI | **Links in the content, no button bar.** A button per director is a phone book. The facet exists in the model and the URL; the name in the entry is the control. |
| Rating as a facet | **`at-least`, not a tag.** Ratings are ordinal — you want ≥ 4, and tags have no ≥. |
| Dead filter combinations | **Greyed out with a count**, computed per-facet excluding its own selection — so sibling options in one menu never disable each other. Empty state kept as the backstop for URLs. |
| Unavailable option markup | **`aria-disabled`, not `disabled`.** Keeps the option focusable and discoverable; the click handler declines. Never active-and-disabled at once. |
| Filter control type | **Checkboxes and radios in a native `popover`**, not toggle buttons — the controls are genuinely a multi-select and a one-from-many. The script binds to any element with `data-facet`/`data-value`, so this is swappable without touching the logic. |
| Creator links vs the menu | **Both, independently.** The menu narrows a list; a name in an entry answers "more by this person". Neither is the mechanism — the URL is. |
| Stash body | **Optional**, unlike a note's. A rating with no review is a legitimate entry, and there is no permalink for it to look empty on. |
| Creator alias map | **No.** It would catch "Ursula K. Le Guin" vs "Ursula Le Guin", but it is a controlled vocabulary by another name. The guard catches variant *spellings*; different names are out of scope. |
| Stash facet options | **Derived from the entries**, never the full `medium` enum — a medium nothing is logged in is not offered, matching `getTagsInUse()`. |
