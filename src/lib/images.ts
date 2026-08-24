import type { ImageMetadata } from 'astro';

/**
 * Responsive props for a cover <Image>, spread in at the call site:
 * `<Image src={cover} alt={alt} {...coverImageProps(cover, WIDTHS, SIZES)} />`
 *
 * Vectors get neither prop. Asking a vector for a `widths` array emits several
 * byte-identical copies of the same file under different hashes, plus a srcset
 * that can never do anything — vectors scale for free. Discovered in Phase 3;
 * lives here so the guard isn't re-derived in every component with a cover.
 *
 * Both numbers are the *caller's* to get right: `sizes` must describe the width
 * the image is actually drawn at in that layout, and the top of `widths` should
 * be roughly that width × 2 for retina. Neither fails loudly when wrong — the
 * page just costs more or renders soft. See docs/content-architecture.md §5.
 */
export function coverImageProps(
  cover: ImageMetadata,
  widths: number[],
  sizes: string,
): { widths?: number[]; sizes?: string } {
  return cover.format === 'svg' ? {} : { widths, sizes };
}
