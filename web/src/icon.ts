/**
 * The icon a coin gets when its creator uploads no picture: the crown on a
 * dark disc. Stored on-chain like any other icon, so it must stay small.
 */
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#1c1c1c"/>` +
  `<g stroke="#fff" stroke-width="3" stroke-linejoin="round"><path d="M24 62 18 34l13 13 7-21 10 19 10-19 7 21 13-13-6 28z" fill="#f8d23c"/>` +
  `<path d="M22 62h52v9H22z" fill="#f3b72c"/></g><circle cx="48" cy="54" r="3.4" fill="#45b4ea"/></svg>`;

export const DEFAULT_ICON = "data:image/svg+xml;utf8," + encodeURIComponent(svg);

/** True when a coin was launched without a picture of its own. */
export const isDefaultIcon = (icon: string | null | undefined) => icon === DEFAULT_ICON;
