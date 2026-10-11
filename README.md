# Cloudlight reconstruction

Self-contained reconstruction of https://rbp-cloudlight-template.vercel.app/.

## Run

```sh
npm run dev
```

Open http://localhost:4173. No dependency installation or build is needed.

```sh
npm run check
```

## Files

- `dist/index.html`: complete semantic page markup, content, inline SVG icons and local image references.
- `dist/reference.css`: the reference's public design tokens, typography and layout utilities.
- `dist/styles.css`: responsive corrections and interaction styling.
- `dist/app.js`: menus, themes, benchmarks, teams, stories, pricing and FAQ.
- `dist/effects.js`: reveal choreography, pill springs, cursor-reactive 3D grid and scroll manifesto.
- `dist/gl-surface.js`: WebGL2 lifecycle, visibility and reduced-motion handling.
- `dist/assets/cloud.frag` and `wave.frag`: the reference's public procedural shaders.
- `dist/data.js`: editable team and testimonial states from the reference.
- `asset-sources.json`: provenance of the localized visual assets.

The HTML, CSS, shaders, copy and image references were recovered from the supplied public reference; behavior was reimplemented as independent, readable JavaScript. No Next.js runtime, remote JavaScript, image CDN or source-site API is required at runtime. All fonts and images are local.

Account, subscription and contact links open an explicit demo dialog. The page does not upload files, collect credentials or pretend to operate a transfer backend. Marketing claims and testimonials are preserved as template content, not independently verified product claims.

`scripts/prepare-reference.py` records the one-time import procedure. It requires BeautifulSoup/json5 and the inspection inputs from the original analysis; normal development and deployment never run it.

## Responsive and accessibility

Navigation changes at 768px; formats use 4/6/8 columns, security cards 1/2/4, and pricing 1/3. The mobile navigation supports Escape and a focus loop. Tabs support arrow keys, Home and End. FAQ state uses ARIA. Animations respect reduced motion, canvases pause outside the viewport and in hidden tabs, and a static fallback remains when WebGL2 is unavailable.
