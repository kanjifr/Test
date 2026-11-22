import type { SiteTheme } from "@/lib/theme";

/** Particules qui tombent en fond : pétales, flocons ou feuilles selon le thème. */
export function SeasonalDecor({ theme }: { theme: SiteTheme }) {
  const count = theme === "noel" ? 26 : 7;
  // Positions fixes (pas d'aléatoire : même rendu côté serveur et navigateur)
  const flakes = Array.from({ length: count }, (_, i) => {
    const r = (n: number) => ((i * 9301 + n * 49297) % 233280) / 233280;
    return {
      left: `${Math.round(r(1) * 100)}%`,
      delay: `-${Math.round(r(2) * 18)}s`,
      duration: `${10 + Math.round(r(3) * 12)}s`,
      size: theme === "noel" ? `${4 + Math.round(r(4) * 8)}px` : undefined,
      opacity: theme === "noel" ? 0.45 + r(5) * 0.5 : undefined,
    };
  });
  return (
    <div className={`petals decor-${theme}`} aria-hidden>
      {flakes.map((f, i) => (
        <span
          key={i}
          style={{ left: f.left, animationDelay: f.delay, animationDuration: f.duration, width: f.size, height: f.size, opacity: f.opacity }}
        />
      ))}
    </div>
  );
}
