"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isStandalone, platform } from "@/components/AppSettings";

const KEY = "kizuna.installHint.hidden";

/** Petite invitation à installer l'application, sur téléphone uniquement. */
export function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {}
    setShow(platform() !== "other" && !isStandalone());
  }, []);
  if (!show) return null;
  return (
    <div className="panel install-hint">
      <span>📱 Installe Kizuna sur ton téléphone et reçois une notification quand ton booster est prêt.</span>
      <span className="row">
        <Link href="/profil#appli" className="btn btn-sm">
          Comment faire
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setShow(false);
            try {
              localStorage.setItem(KEY, "1");
            } catch {}
          }}
        >
          Plus tard
        </button>
      </span>
    </div>
  );
}
