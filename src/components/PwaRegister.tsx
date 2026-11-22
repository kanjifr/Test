"use client";

import { useEffect } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global {
  interface Window {
    __kizunaInstall?: InstallPrompt | null;
  }
}
export const INSTALL_EVENT = "kizuna:install";

/** Enregistre le service worker et garde l'invitation d'installation (Android, Chrome, Edge). */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__kizunaInstall = e as InstallPrompt;
      window.dispatchEvent(new Event(INSTALL_EVENT));
    };
    const onInstalled = () => {
      window.__kizunaInstall = null;
      window.dispatchEvent(new Event(INSTALL_EVENT));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
