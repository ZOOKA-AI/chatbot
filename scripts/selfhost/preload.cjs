// Makes the application modules runnable outside Next.
//
// Two differences matter. `server-only` throws unless a bundler replaces it, and the `@/`
// import alias only exists in the TypeScript/Next configuration. Both are redirected here,
// before any application module is loaded, so the worker and scheduler execute the same
// code as the web app without a second copy of it.
const Module = require("node:module");
const path = require("node:path");

const stub = path.join(__dirname, "server-only.stub.cjs");
const projectRoot = path.resolve(__dirname, "..", "..");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolve(request, ...rest) {
  if (request === "server-only") return stub;
  if (request.startsWith("@/")) {
    return originalResolve.call(this, path.join(projectRoot, request.slice(2)), ...rest);
  }
  return originalResolve.call(this, request, ...rest);
};
