/**
 * Client-side faceted filtering, shared by /writing, /notes and /stash.
 *
 * Everything is rendered server-side and filtering only toggles visibility, so
 * the full list stays crawlable and works with JS disabled.
 *
 * Two combining rules:
 *
 *   - **OR within a facet.** Tag "Astro" or "Process" shows either. Tags are a
 *     broadening tool; AND mostly produces empty results as a vocabulary grows.
 *   - **AND across facets.** Medium "Film" and genre "Sci-fi" means sci-fi
 *     films. OR across facets would mean every film plus every sci-fi book,
 *     which is not what anyone selecting both intends.
 *
 * See docs/content-architecture.md §4.5.
 */

type Mode = 'one-of' | 'at-least' | 'flag';

/** Anything carrying data-facet + data-value: checkbox, radio, button, link. */
type Control = HTMLElement;

interface Facet {
  name: string;
  mode: Mode;
  /**
   * Values actually present on the items. A URL is validated against this
   * rather than against the controls, which is what lets a facet be driven by
   * links in the content instead of a menu — see the creator facet.
   */
  known: Set<string>;
  active: Set<string>;
  controls: Control[];
  /** The menu trigger, if this facet has one. */
  trigger: HTMLElement | null;
}

/** `tag` → `facetTag`, matching how the DOM camel-cases data-facet-tag. */
const datasetKey = (name: string) => `facet${name[0].toUpperCase()}${name.slice(1)}`;

const valuesOf = (element: HTMLElement, name: string): string[] =>
  (element.dataset[datasetKey(name)] ?? '').split(' ').filter(Boolean);

/** Fallback display name for a value with no control to borrow one from. */
const prettify = (value: string) =>
  value.replace(/-/g, ' ').replace(/(^|\s)\w/g, (c) => c.toUpperCase());

export function initFacetFilter(): void {
  const list = document.querySelector<HTMLElement>('[data-filterable-list]');
  if (!list) return;

  const root = document.querySelector<HTMLElement>('[data-facet-filter]');
  const status = document.querySelector<HTMLElement>('[data-filter-status]');
  const empty = document.querySelector<HTMLElement>('[data-filter-empty]');
  const clearButton = document.querySelector<HTMLButtonElement>('[data-facet-clear]');

  /*
   * `:scope >`, not a descendant search. Previews render their own <ul> of tag
   * chips, so a plain querySelectorAll('li') counts every chip as an item —
   * "1 of 19" on a page of seven posts — and hides the chips as a bonus.
   */
  const items = Array.from(list.querySelectorAll<HTMLElement>(':scope > li'));
  /*
   * Both forms, because naive +"s" produces "entrys". English plurals are not
   * a rule the page should have to work around by picking a convenient noun.
   */
  const noun = list.dataset.filterNoun ?? 'item';
  const nounPlural = list.dataset.filterNounPlural ?? `${noun}s`;

  /*
   * Facets are discovered from the items, not from the controls. A facet with
   * no controls is still a facet — it just has to be activated by a link or a
   * URL — and a control for a value no item has can never be offered.
   */
  const names = new Set<string>();
  for (const item of items) {
    for (const key of Object.keys(item.dataset)) {
      if (key.startsWith('facet') && key.length > 'facet'.length) {
        names.add(key['facet'.length].toLowerCase() + key.slice('facet'.length + 1));
      }
    }
  }
  if (names.size === 0) return;

  const labels = new Map<string, string>();
  const labelKey = (facet: string, value: string) => `${facet} ${value}`;

  const facets: Facet[] = [...names].map((name) => {
    const group = root?.querySelector<HTMLElement>(`[data-facet-group="${name}"]`);
    const controls = Array.from(
      document.querySelectorAll<Control>(`[data-facet="${name}"][data-value]`),
    );

    // Controls carry the human-readable name of each value; the status region
    // needs it, and nothing else in the DOM knows it.
    for (const control of controls) {
      const value = control.dataset.value;
      if (!value) continue;
      const label =
        control.dataset.facetLabel ??
        control.closest('label')?.querySelector('[data-facet-text]')?.textContent?.trim() ??
        control.textContent?.trim();
      if (label) labels.set(labelKey(name, value), label);
    }

    return {
      name,
      mode: (group?.dataset.facetMode as Mode) ?? 'one-of',
      known: new Set(items.flatMap((item) => valuesOf(item, name))),
      active: new Set<string>(),
      controls,
      trigger: group?.querySelector<HTMLElement>('[data-facet-trigger]') ?? null,
    };
  });

  const displayName = (facet: string, value: string) =>
    labels.get(labelKey(facet, value)) ?? prettify(value);

  /** Does this item satisfy one facet, given a set of selected values? */
  function satisfies(item: HTMLElement, facet: Facet, active: Set<string>): boolean {
    if (active.size === 0) return true;

    const values = valuesOf(item, facet.name);

    switch (facet.mode) {
      case 'flag':
        return values.includes('true');

      case 'at-least': {
        // Lowest active threshold wins, so "4+" and "3+" together mean 3+.
        const threshold = Math.min(...[...active].map(Number));
        const value = Number(values[0]);
        return Number.isFinite(value) && value >= threshold;
      }

      case 'one-of':
      default:
        return values.some((value) => active.has(value));
    }
  }

  const matches = (item: HTMLElement, facet: Facet) => satisfies(item, facet, facet.active);

  /**
   * How many items a value would leave, counted against every *other* facet
   * but ignoring this facet's own selection.
   *
   * Ignoring its own selection is the whole point. Values within a facet are
   * ORed, so choosing "Film" must not grey out "Book" — you can have both. But
   * "Horror" is a genre spanning films and books, so once "Film" is chosen it
   * should grey out if no film is tagged horror. Counting per-facet with self
   * excluded gives exactly that, in one rule rather than a hand-maintained map
   * of which facets interact.
   */
  function availability(facet: Facet, value: string): number {
    const probe = new Set([value]);
    return items.filter(
      (item) =>
        facets.every((other) => other === facet || matches(item, other)) &&
        satisfies(item, facet, probe),
    ).length;
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    for (const facet of facets) {
      url.searchParams.delete(facet.name);
      for (const value of facet.active) url.searchParams.append(facet.name, value);
    }
    history.replaceState(null, '', url);
  }

  /** Reflect state onto a control, whatever kind of element it happens to be. */
  function reflect(control: Control, isActive: boolean, isDead: boolean) {
    if (control instanceof HTMLInputElement) {
      control.checked = isActive;
    } else {
      control.setAttribute('aria-pressed', String(isActive));
    }

    /*
     * aria-disabled, never the `disabled` attribute or `hidden`. A disabled
     * control drops out of the tab order and most screen reader listings, so a
     * non-sighted user cannot discover that the option exists at all — they
     * just find a shorter list than everyone else. aria-disabled keeps it
     * focusable and announced; the click handler is what actually declines.
     */
    control.setAttribute('aria-disabled', String(isDead));
    control.closest('label')?.toggleAttribute('data-facet-unavailable', isDead);
  }

  function apply() {
    let shown = 0;

    for (const item of items) {
      const match = facets.every((facet) => matches(item, facet));
      item.hidden = !match;
      if (match) shown += 1;
    }

    for (const facet of facets) {
      for (const control of facet.controls) {
        const value = control.dataset.value ?? '';
        const isActive = facet.active.has(value);

        if (value === '') {
          // The "Any" reset option: selected when nothing in the facet is.
          reflect(control, facet.active.size === 0, false);
          continue;
        }

        const count = availability(facet, value);

        // Never dead while active, or there would be no way to switch it off.
        reflect(control, isActive, count === 0 && !isActive);

        const readout = control
          .closest('label')
          ?.querySelector<HTMLElement>('[data-facet-count]');
        if (readout) readout.textContent = String(count);
      }

      if (facet.trigger) {
        const readout = facet.trigger.querySelector<HTMLElement>('[data-facet-active-count]');
        if (readout) readout.textContent = facet.active.size > 0 ? String(facet.active.size) : '';
      }
    }

    const activeFacets = facets.filter((facet) => facet.active.size > 0);

    if (clearButton) clearButton.hidden = activeFacets.length === 0;
    if (empty) empty.hidden = shown > 0;

    if (status) {
      if (activeFacets.length === 0) {
        status.hidden = true;
        status.textContent = '';
      } else {
        const described = activeFacets
          .map((facet) =>
            [...facet.active].map((value) => displayName(facet.name, value)).join(', '),
          )
          .join('; ');

        status.hidden = false;
        status.textContent =
          `Showing ${shown} of ${items.length} ${shown === 1 ? noun : nounPlural}` +
          `, filtered by: ${described}.`;
      }
    }
  }

  function toggle(facet: Facet, value: string) {
    // The "Any" reset option.
    if (value === '') {
      facet.active.clear();
      return;
    }

    const wasActive = facet.active.has(value);

    /*
     * "at-least" and "flag" are single-valued: two thresholds at once is
     * meaningless, and a flag is on or off. Selecting a new value replaces
     * rather than adds.
     */
    if (facet.mode !== 'one-of') facet.active.clear();

    if (wasActive) facet.active.delete(value);
    else facet.active.add(value);
  }

  for (const facet of facets) {
    for (const control of facet.controls) {
      control.addEventListener('click', (event) => {
        // Declining here rather than via `disabled` keeps the control
        // focusable; on an <input> this also prevents the native state change.
        if (control.getAttribute('aria-disabled') === 'true') {
          event.preventDefault();
          return;
        }

        // A link-driven facet keeps a real href so it degrades to a plain
        // page load; with JS the filter applies in place instead.
        if (control instanceof HTMLAnchorElement) event.preventDefault();

        const value = control.dataset.value;
        if (value === undefined) return;

        toggle(facet, value);
        apply();
        syncUrl();
      });
    }
  }

  clearButton?.addEventListener('click', () => {
    for (const facet of facets) facet.active.clear();
    apply();
    syncUrl();
  });

  /*
   * Restore from the URL, ignoring any value no item actually has — a
   * hand-edited address, or a tag removed from the vocabulary since the link
   * was shared. Validating against the items rather than the controls keeps
   * link-driven facets working.
   */
  const params = new URLSearchParams(window.location.search);
  let dropped = false;

  for (const facet of facets) {
    for (const value of params.getAll(facet.name)) {
      if (facet.known.has(value)) facet.active.add(value);
      else dropped = true;
    }
    // A single-valued facet given several values in the URL keeps the first.
    if (facet.mode !== 'one-of' && facet.active.size > 1) {
      const [first] = facet.active;
      facet.active = new Set([first]);
      dropped = true;
    }
  }

  if (root) root.hidden = false;
  apply();

  // Rewrite if anything was dropped, so a shared link never claims a filter
  // that isn't actually applied.
  if (dropped) syncUrl();
}

initFacetFilter();
