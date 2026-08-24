import type { TagEntry } from './content';

/**
 * Shapes for the filter UI. See docs/content-architecture.md §4.5.
 *
 * `one-of`   OR within the facet — tags, medium, creator.
 * `at-least` numeric threshold, single-valued — rating.
 * `flag`     a boolean, on or off — recommended.
 */
export type FacetMode = 'one-of' | 'at-least' | 'flag';

export interface FacetOption {
  value: string;
  label: string;
  /** Tooltip — tag descriptions, mostly. */
  title?: string;
}

export interface FacetGroup {
  /**
   * Doubles as the URL parameter and the item attribute suffix
   * (`tag` → `?tag=` and `data-facet-tag`). Single word: the DOM camel-cases
   * anything hyphenated and the two stop matching.
   */
  name: string;
  /**
   * Short human name — "Tag", "Medium", "Rating". Used twice: as the menu
   * trigger's text and as the fieldset's legend, so it wants to be a noun
   * rather than an instruction.
   */
  label: string;
  mode?: FacetMode;
  options: FacetOption[];
}

/**
 * The tag facet, built the same way on every page that has one. Options come
 * from getTagsInUse(), so a filter is never offered that would return nothing.
 */
export const tagFacet = (tags: TagEntry[], label = 'Tag'): FacetGroup => ({
  name: 'tag',
  label,
  options: tags.map((tag) => ({
    value: tag.id,
    label: tag.data.name,
    title: tag.data.description,
  })),
});

/** Space-separated facet values for an item's data attribute. */
export const facetValues = (values: string[]): string => values.join(' ');
