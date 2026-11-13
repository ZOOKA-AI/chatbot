/**
 * Loads the Pyodide runtime only when a user actually runs Python code.
 *
 * Previously the script was injected on every chat page with
 * `strategy="beforeInteractive"`, which blocked first paint with a ~10 MB
 * third-party download for users who never run code. Loading it on demand
 * keeps the chat fast and limits third-party script exposure to the moment
 * the user asks for it.
 */
export const PYODIDE_VERSION = "v0.23.4";
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const PYODIDE_SCRIPT_URL = `${PYODIDE_INDEX_URL}pyodide.js`;

type LoadPyodide = (options: { indexURL: string }) => Promise<unknown>;

let pending: Promise<LoadPyodide> | null = null;

function existingLoader(): LoadPyodide | undefined {
  return (globalThis as { loadPyodide?: LoadPyodide }).loadPyodide;
}

export function ensurePyodideLoader(): Promise<LoadPyodide> {
  const ready = existingLoader();
  if (ready) {
    return Promise.resolve(ready);
  }
  if (pending) {
    return pending;
  }
  pending = new Promise<LoadPyodide>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PYODIDE_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = () => {
      const loader = existingLoader();
      if (loader) {
        resolve(loader);
      } else {
        pending = null;
        reject(new Error("pyodide_unavailable"));
      }
    };
    script.onerror = () => {
      pending = null;
      script.remove();
      reject(new Error("pyodide_load_failed"));
    };
    document.head.appendChild(script);
  });
  return pending;
}
