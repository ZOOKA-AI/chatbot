/*
 * The copyright year is resolved once when this module loads (at build time),
 * never during render. Next 16 refuses a `new Date()` that runs inside a
 * prerendered component, and a footer does not need a live clock.
 */
export const SITE_YEAR = new Date().getFullYear();
