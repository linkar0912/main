import { PRODUCT_NAME } from "./branding";

/** Headline drawn on the shared social card (app/opengraph-image.tsx). */
export const SOCIAL_CARD_HEADLINE = "Instagram automation for comments, DMs and Stories";

/**
 * The shared 1200x630 PNG card served at /opengraph-image. Next attaches it to
 * every page that does not set its own openGraph object. A page that does set
 * one (pricing) replaces the inherited images too, so it lists this card itself.
 */
export const DEFAULT_SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${PRODUCT_NAME}: ${SOCIAL_CARD_HEADLINE}`,
} as const;
