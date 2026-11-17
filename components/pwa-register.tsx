"use client";

import { useEffect } from "react";

/**
 * Registers the installable-app service worker (public/sw.js).
 *
 * Production only: a service worker in development can cache the local build
 * and hide freshly compiled assets, so it is skipped outside production.
 * Registration is silent and never blocks rendering or the network panel.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Offline support is progressive: a failed registration must never
        // surface as an error to the user.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
