"use client";

import { useState } from "react";

/** Copie l'adresse de la page (ou celle donnée) dans le presse-papiers. */
export function CopyLink({ path, label = "Copier le lien" }: { path: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.prompt("Copie ce lien :", url);
        }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? "✔ Lien copié !" : `🔗 ${label}`}
    </button>
  );
}
