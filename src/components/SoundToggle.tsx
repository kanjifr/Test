"use client";

import { useEffect, useState } from "react";
import { onSoundChange, play, setSound, soundOn } from "@/lib/sfx";

/** Bouton 🔊 / 🔇 du menu. */
export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(soundOn());
    return onSoundChange(() => setOn(soundOn()));
  }, []);
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={on}
      aria-label={on ? "Couper les effets sonores" : "Activer les effets sonores"}
      title={on ? "Couper le son" : "Activer le son"}
      onClick={() => {
        setSound(!on);
        if (!on) play("rare");
      }}
    >
      {on ? (
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></svg>
      ) : (
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></svg>
      )}
    </button>
  );
}
