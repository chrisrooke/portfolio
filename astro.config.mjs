// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  /**
   * ⚠️ PLACEHOLDER DOMAIN — change this one line before deploying.
   *
   * Everything absolute derives from it: canonical URLs and og:url in
   * Base.astro, every <loc> in sitemap-index.xml, and every <link> in the RSS
   * feed. Astro.site is undefined without it, which is why those were silently
   * missing until Phase 10 rather than erroring.
   */
  site: 'https://chrisrooke.dev',

  integrations: [
    mdx(),
    sitemap({
      /*
       * Only /404 is excluded: a sitemap is a list of pages worth crawling and
       * an error page is not one. The human /sitemap page stays in — it is a
       * real page with real content, and excluding it would be a category
       * error about what sitemap.xml is for.
       */
      filter: (page) => !page.endsWith('/404/'),
    }),
  ],
});
