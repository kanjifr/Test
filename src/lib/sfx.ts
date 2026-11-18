"use client";

/**
 * Effets sonores synthétisés par le navigateur (aucun fichier à charger).
 * Le son est coupé ou remis par le bouton du menu ; le choix est mémorisé sur cet appareil.
 */
export type Sfx = "tear" | "flip" | "rare" | "epic" | "legendary" | "mythic" | "hit" | "crit" | "dodge" | "win" | "lose";

const KEY = "kizuna.sound";
const EVENT = "kizuna-sound";
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSound(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function onSoundChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

function audio() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Une note : fréquence (Hz), départ et durée (s), forme d'onde, volume. */
function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.18, slideTo?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  const t = a.currentTime + start;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Souffle de bruit filtré (déchirure, coups). */
function noise(a: AudioContext, start: number, dur: number, from: number, to: number, vol = 0.25) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  const t = a.currentTime + start;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

const arpeggio = (a: AudioContext, notes: number[], step: number, type: OscillatorType, vol: number, dur = 0.5) =>
  notes.forEach((n, i) => tone(a, n, i * step, dur, type, vol));

export function play(s: Sfx) {
  if (!soundOn()) return;
  const a = audio();
  if (!a) return;
  switch (s) {
    case "tear":
      noise(a, 0, 0.45, 600, 4000, 0.3);
      tone(a, 220, 0.05, 0.35, "triangle", 0.08, 660);
      break;
    case "flip":
      noise(a, 0, 0.12, 2500, 5000, 0.12);
      tone(a, 660, 0, 0.12, "triangle", 0.06, 990);
      break;
    case "rare":
      arpeggio(a, [784, 1175], 0.08, "triangle", 0.12, 0.35);
      break;
    case "epic":
      arpeggio(a, [523, 659, 784, 1047], 0.07, "triangle", 0.12, 0.45);
      break;
    case "legendary":
      arpeggio(a, [392, 523, 659, 784, 1047, 1319], 0.07, "sawtooth", 0.06, 0.6);
      arpeggio(a, [523, 784, 1047], 0.09, "sine", 0.1, 0.9);
      break;
    case "mythic":
      tone(a, 65, 0, 1.4, "sine", 0.35, 45);
      arpeggio(a, [523, 659, 784, 1047, 1319, 1568, 2093], 0.08, "sawtooth", 0.05, 0.8);
      arpeggio(a, [1047, 1319, 1568, 2093], 0.12, "sine", 0.09, 1.2);
      break;
    case "hit":
      noise(a, 0, 0.18, 1200, 300, 0.35);
      tone(a, 160, 0, 0.18, "square", 0.07, 70);
      break;
    case "crit":
      noise(a, 0, 0.28, 2500, 300, 0.45);
      tone(a, 220, 0, 0.3, "sawtooth", 0.1, 60);
      tone(a, 1318, 0.02, 0.25, "triangle", 0.07);
      break;
    case "dodge":
      noise(a, 0, 0.2, 3000, 6000, 0.12);
      break;
    case "win":
      arpeggio(a, [523, 659, 784, 1047], 0.12, "triangle", 0.13, 0.6);
      tone(a, 1047, 0.5, 0.9, "sine", 0.1);
      break;
    case "lose":
      arpeggio(a, [392, 349, 311, 262], 0.16, "triangle", 0.1, 0.5);
      break;
  }
}

/** Son de révélation selon la rareté d'une carte. */
export function playReveal(rarity: string) {
  if (rarity === "MYTHIQUE") play("mythic");
  else if (rarity === "LEGENDAIRE") play("legendary");
  else if (rarity === "EPIQUE") play("epic");
  else if (rarity === "RARE") play("rare");
  else play("flip");
}
