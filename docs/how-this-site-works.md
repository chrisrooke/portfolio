# How this site works

A walkthrough in plain terms, meant to be read start to finish. It explains the shape of the
thing rather than the reasoning behind it — for *why* each decision went the way it did, see
[content-architecture.md](./content-architecture.md).

---

## The one-minute version

The site is **static**. Every page is written to a file on disk before anyone visits, and the
server just hands over files. Nothing is generated while someone is waiting.

Content is **plain text files you edit** — Markdown, the same as a README. Each one starts
with a few lines of settings (a title, a date, some tags), then the words.

When you run a build, Astro reads all those files, checks each one against a set of rules,
and writes out the finished HTML.

```
    you write                    the build                     visitors get
   ──────────                   ───────────                   ──────────────
   Markdown files    ──────▶    checks the rules   ──────▶    plain HTML files
   in src/content/              builds the pages              in dist/
```

If a file breaks a rule — a missing date, a tag that doesn't exist, an image without
alt text — **the build stops and tells you which file**. Nothing broken can reach the site,
because it never gets built in the first place. That is the single most useful property of
the whole setup.

---

## Step 1 — Where the content lives

Everything you'd actually write lives in `src/content/`, in five folders:

| Folder | What goes in it | Gets its own page? |
|---|---|---|
| `writing/` | Articles. The long stuff. | Yes — `/writing/tokens-before-components` |
| `projects/` | Case studies about work you've done. | Yes — `/projects/lattice` |
| `notes/` | Short thoughts. Often no title. | No — they live on `/notes` |
| `stash/` | Books, films, records, games you've logged. | No — they live on `/stash` |
| `tags.json` | The list of allowed tags. | No |

**Notes and stash entries deliberately have no page of their own.** A one-line note doesn't
need a whole page with a header and a footer wrapped around it. They appear in their feed and
that's it. You can still link to a specific one — `/notes/#note-2026-08-21-anchor-positioning`
jumps to it — but there's no separate page to visit.

### What a file actually looks like

A note (`src/content/notes/2026-08-21-anchor-positioning.md`):

```markdown
---
publishDate: 2026-08-21
tags: [accessibility]
---

Spent an hour replacing a popover positioning library with twelve lines of CSS
anchor positioning.
```

Everything between the two `---` lines is settings. Everything after is what people read.
That's the whole format, and it's the same for all four kinds of content — only the settings
differ.

---

## Step 2 — The rules each file has to follow

`src/content.config.ts` is one file that describes what each kind of content is allowed to
contain. Think of it as a form that every Markdown file has to fill in correctly.

For a note, the form says:

- **publishDate** — required
- **title** — optional, because most notes don't have one
- **url** and **urlLabel** — optional, for when you're linking to something
- **tags** — optional, but each one must be a tag that actually exists in `tags.json`

Get one wrong and the build stops with a message naming the file and the problem. You cannot
publish a post with a typo'd tag, because the typo is caught before the page exists.

### The rules that a form can't express

A form can only check the *settings* at the top of a file. It can't look at the words below.
So a handful of checks live in code instead, and they also stop the build:

| Check | Why it exists |
|---|---|
| An article has words, or a link elsewhere | Otherwise it builds as a blank page |
| A note has words | A note with only a link is a bookmark |
| An image has alt text | Silent accessibility bug otherwise |
| A project links to articles that exist | Otherwise the failure surfaces much later, unreadably |
| No article belongs to two series | "Part 3 of 5" would be ambiguous |
| A person's name is spelled the same everywhere | "Ken Burns" and "KenBurns" would filter as two people |

These are the site's opinions, enforced. Each one produces an error naming the file and, where
relevant, the other file it disagrees with.

---

## Step 3 — Getting content onto a page

There's one rule here, and everything else follows from it:

> **No page reads the content folders directly. They all go through one file:
> `src/lib/content.ts`.**

That file offers a set of ready-made requests — "give me all the articles", "give me the
projects", "give me notes and stash mixed together in date order" — and every page uses those
instead of rummaging through folders itself.

The reason is drafts. Any file can be marked `draft: true`, which means:

- **it shows up when you're previewing locally**, so you can see work in progress
- **it vanishes from the real build**, so it can't accidentally go live

That rule is written down in exactly one place. If it were repeated on every page, one page
would eventually forget, and something unfinished would ship. The same goes for sorting: dates
are sorted in one place, so nothing can be out of order on one page and right on another.

---

## Step 4 — How the pages get made

`src/pages/` is the site map. **A file there becomes a page at the matching address.**

```
src/pages/about.astro          →  /about
src/pages/notes.astro          →  /notes
src/pages/writing/index.astro  →  /writing
```

Two of them are special. `src/pages/writing/[...id].astro` has square brackets in the name,
which means "make one of these for every article" — one file that currently produces five
pages. Same for projects.

Five, not six, because one of the six articles is a link to something published elsewhere.
Those live in the same folder as everything else and appear in all the same lists, but the
link points off-site, so no page is built for them.

Altogether the site currently builds 18 addresses: the homepage, four section pages, seven
individual articles and projects, about, colophon, sitemap, 404, and two feeds.

---

## Step 5 — What a visitor sees

Three kinds of building block, from outermost in:

**Layouts** wrap a whole page. `Base.astro` provides the skeleton every page shares — the
`<head>`, the navigation, the footer. `Post.astro` sits inside it and handles the long-form
shape: title, date, cover image, the words, and tags. It's shared by articles and project
case studies, with two optional slots for the bits that differ.

**Components** are the repeated pieces:

| Component | Where you see it |
|---|---|
| `WritingPreview` | The title-and-summary block in the writing list |
| `ProjectPreview` | The same idea, but leading with cover art |
| `FeedItem` | One note or one stash entry, rendered in full |
| `StashMeta` / `ProjectMeta` | The little facts blocks — medium, year, rating, role |
| `SeriesList` | "The series" list at the bottom of a project |
| `FacetFilter` | The filter menus |

**Pages** just fetch content and arrange components. They stay short on purpose.

### The one clever bit: series

A project can list articles that belong to it, in reading order. From that single list, the
site works out the reverse automatically — each article knows it's "Part 2 of 3" without you
writing that anywhere.

The order is **the order you list them in**, not publication date, so you can write part three
first, or add a part later and slot it in the middle. Nothing needs renumbering because
nothing is numbered.

---

## Step 6 — Filtering

Three pages let you narrow what's shown: writing, notes, and stash. All three use the same
code.

Everything is already on the page when it loads. Filtering just hides things. That means it
works instantly, search engines see the full list, and if JavaScript fails the filter controls
simply don't appear — you get everything, rather than buttons that don't work.

**Stash has five filters**, and the way they combine is worth knowing:

- Picking **two options in the same menu** widens the result. Film *or* Book shows both.
- Picking options in **different menus** narrows it. Film *and* Sci-fi shows sci-fi films.

That's what people intuitively expect, and it's why the two behave differently.

Options that would give you nothing are **greyed out and show a count**, so you can see there
are no jazz films before clicking. Options in the menu you're currently using never grey each
other out — otherwise picking Film would disable Book, and you'd be unable to ask for both.

Whatever you pick goes into the address bar, so a filtered view can be bookmarked or shared.

---

## Step 7 — Ways out of the site

**Two RSS feeds**, because there are two reasonable things to want:

- `/rss.xml` — everything
- `/articles.xml` — just the long-form, for people who don't want a week of one-line notes
  between the essays

**Two sitemaps**, for two different readers:

- `/sitemap` — a page you can read, listing every single item on the site
- `/sitemap-index.xml` — the same information for search engines

**Social cards.** When a page gets shared, the preview image is the page's own cover art if it
has one, and a default card if not. That's `public/og-default.png`.

---

## Doing things

### Add an article

Create `src/content/writing/my-post.mdx`:

```markdown
---
title: My post
intro: One sentence that shows up in listings.
publishDate: 2026-09-01
tags: [design-systems]
---

The actual article.
```

It appears at `/writing/my-post`, in the writing list, on the homepage, and in both feeds.
Add `draft: true` while you're still working on it.

### Add a note

Create `src/content/notes/2026-09-01-something.md`. Only `publishDate` is required. The
date-first filename is a convention — notes usually have no title to name a file after.

### Add a stash entry

Create `src/content/stash/some-film.md`:

```markdown
---
title: Some Film
medium: film
creator: [A Director]
year: 2019
rating: 4
recommended: true
publishDate: 2026-09-01
tags: [science-fiction]
---

What you thought.
```

`medium` must be one of: book, film, tv, album, game, podcast, article. The review is
optional. **Spell names exactly as you have elsewhere** — the build will stop you if you
write "A Director" one time and "ADirector" another.

### Add a tag

Add it to `src/content/tags.json` first, then use it. Using a tag that isn't in that file
fails the build — which is the point. Tags are shared across everything, so a genre on a film
and a topic on an article live in the same list. Each page only ever offers the tags actually
used on that page, so `/writing` never shows a "Horror" filter.

### Link articles to a project

In the project's file, list them in reading order:

```yaml
relatedWriting:
  - tokens-before-components
  - the-component-api-is-the-product
  - documenting-a-system-nobody-reads
```

The articles need no changes. They'll each show which part they are.

### Preview and build

```
astro dev --background     # preview locally, drafts visible
astro dev logs             # see what it's saying
astro dev stop             # stop it
astro build                # build the real thing, drafts excluded
```

One catch worth knowing: **if you change `content.config.ts`, restart the preview server.**
It caches the content and will otherwise show you nothing with no explanation.

---

## What isn't done

- **There is no design.** `global.css` is empty. Everything is correctly structured but
  entirely unstyled — deliberately, so the structure was right before anything was decorated.
- **Image sizes are guesses.** Three places tell the browser how wide images will be drawn,
  and all three were invented before a layout existed. They need revisiting together.
- **The domain is a placeholder.** `astro.config.mjs` says `https://chrisrooke.dev`, which was
  invented. Change that one line and the addresses in both feeds, the sitemap, and every
  page's canonical URL all follow.
