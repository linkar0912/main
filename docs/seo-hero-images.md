# Page-specific Linkar hero images

Every SEO detail page and browsing hub has its own hero asset in
`public/marketing/seo/`. There are 67 scene assignments: 20 features, 20
solutions, 24 recipes, and three hubs. The homepage retains its existing image.

The shot list and page-specific scene prompts are in
`src/content/seo/hero-scenes.json`. The existing original creator-studio image
is assigned only to the creators solution. The other 66 images are generated
individually using the built-in image generation tool. Images are then optimised
to 1536 × 1024 WebP by `scripts/install-seo-hero.mjs`.

The shared layout keeps Linkar’s font, CTA, and conversation styling. The
photography varies by subject, workspace, clothing, lighting, and activity to
match the page. Different image paths alone do not establish different images:
the completed asset inventory is checked for duplicate content hashes too.

## Exact common prompt

Each generation prompt is the following text followed by the corresponding
record’s `scene` value from `hero-scenes.json`:

> Use case: photorealistic-natural. Asset type: an original full-width website hero photograph for Linkar, an Instagram automation SaaS for Indian creators and businesses. Produce one landscape 3:2 editorial photograph, with natural authentic faces and realistic hands. Compose the person or people, relevant props, and the interesting setting on the RIGHT HALF, with heads near the upper-right quadrant; preserve the LEFT 50 percent as quiet uncluttered environmental negative space for headline copy added later in code. Show a natural calm work moment, not a posed advertisement. Use realistic materials and restrained natural colours, with professional cinematic daylight or the scene's specified light. No words, no logos, no watermark, no baked-in UI, no chat bubbles, no legible screen text. Keep the setting and activity distinctly faithful to this page-specific scene. The photo must work at desktop widths and cropped mobile widths. Scene:

The individual scene records and this common prompt are the complete generation
prompt set. No external image API key or browser-time image generation is needed.
