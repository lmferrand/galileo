"use client";

import { useEffect } from "react";

/** Registra el service worker para que la app abra sin internet. */
export default function RegistroOffline() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
