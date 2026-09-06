const DEFAULT_SITE_URL = 'https://flosnidor9.github.io/AfterTheRoll/';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
export const SITE_ORIGIN = new URL(SITE_URL.endsWith('/') ? SITE_URL : `${SITE_URL}/`);
export const DEFAULT_OG_IMAGE_URL = new URL('opengraph-image.png', SITE_ORIGIN).toString();

export const OG_IMAGE_URLS = {
  main: new URL('icon.png', SITE_ORIGIN).toString(),
  bubble: new URL('og/bubble-home.png', SITE_ORIGIN).toString(),
  film: new URL('og/film-home.jpeg', SITE_ORIGIN).toString(),
  afterTheRoll: new URL('og/after-the-roll-avatar.jpg', SITE_ORIGIN).toString(),
} as const;
