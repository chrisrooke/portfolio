---
publishDate: 2026-08-02
tags: [process, design-systems]
---

This one is deliberately overlong, because a format that only works at the
length you intended isn't a format — it's a hope.

The rule for notes here is "short", and that rule is a convention rather than a
constraint. Nothing validates it. Zod never sees the body of a Markdown file,
only its frontmatter, so a `.max()` on the content is not a thing that can
exist. I could add a build-time check that counts characters and fails the
build over it, and I decided not to, for two reasons.

The first is that the check would be wrong about as often as it was right. A
note recommending an article wants a sentence of context and a link. A note
working out a problem might want four paragraphs before it gets anywhere. Both
are notes. The thing they have in common is that they aren't *articles* — they
have no thesis and no obligation to conclude — and that distinction is not one
a character count can see.

The second is that a failed build is an expensive way to deliver an opinion
about prose. If a note is too long, the fix is to make it a post, and I am
capable of noticing that without a script telling me.

What follows from that is a constraint on the layout rather than on the
content. Since nothing stops a note from running long, the feed cannot be built
as though notes are short. No fixed heights. No clamped containers, no
`-webkit-line-clamp` with a fade at the bottom, no "read more" affordance
pointing at a permalink that doesn't exist. Those are all reasonable choices
for a card in a grid and all of them would quietly truncate this paragraph.

Designing for that up front is nearly free. Retrofitting it means finding every
place a height was assumed, which is the sort of thing you discover from a bug
report six months later, written by someone who wrote a long note and watched
the end of it disappear.
