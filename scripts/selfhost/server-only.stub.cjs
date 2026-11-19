// Stands in for the `server-only` package outside a Next.js bundle.
//
// In a Next build that package is an empty module plus a build-time guard: importing it
// from a client component fails the build. There is no build here, so the guard has
// nothing to protect, but the package throws when loaded by plain Node, which is exactly
// what the worker and scheduler are. This file is resolved in its place (see preload.cjs)
// so the same modules can run in both worlds.
module.exports = {};
