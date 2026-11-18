import { ImageResponse } from "next/og";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toCardView } from "@/lib/cards";
import { ELEMENTS, RARITIES, SITE_NAME } from "@/lib/game";

export const dynamic = "force-dynamic";

const FRAMES: Record<string, string> = {
  COMMUNE: "linear-gradient(135deg, #f1eefa, #9a96b0 50%, #e5e2f0)",
  RARE: "linear-gradient(135deg, #c4f2ff, #2f8fd8 50%, #9fe9ff)",
  EPIQUE: "linear-gradient(135deg, #ecdcff, #7b3fe4 50%, #d6b4ff)",
  LEGENDAIRE: "linear-gradient(135deg, #fff2bd, #e0a419 50%, #ffe08a)",
  MYTHIQUE: "linear-gradient(135deg, #ff5fa2, #ffd166 28%, #5ef2ff 55%, #a77bff 80%, #ff5fa2)",
};
const TINTS: Record<string, string> = { COMMUNE: "#5d5880", RARE: "#1f5fa8", EPIQUE: "#5b2fb8", LEGENDAIRE: "#9a5a08", MYTHIQUE: "#a3236f" };
const GLOWS: Record<string, string> = {
  COMMUNE: "0 20px 60px rgba(10,6,40,.6)",
  RARE: "0 0 60px rgba(80,190,255,.7)",
  EPIQUE: "0 0 70px rgba(167,123,255,.8)",
  LEGENDAIRE: "0 0 80px rgba(255,209,102,.85)",
  MYTHIQUE: "0 0 90px rgba(255,95,162,.9)",
};

/** Police Google en TTF (format lu par le générateur d'images), limitée aux caractères utiles. */
async function googleFont(family: string, weight: number, text: string) {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`,
      { headers: { "User-Agent": "Wget/1.0" } },
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

/** Les images servies par le site sont lues en interne ; les autres doivent être en https. */
function imageSource(url: string | null) {
  if (!url) return null;
  if (url.startsWith("/api/uploads/") && /\.(png|jpe?g|gif)$/i.test(url)) return `http://127.0.0.1:${process.env.PORT ?? 3000}${url}`;
  if (/^https:\/\/.+/.test(url) && !/\.webp(\?|$)/i.test(url)) return url;
  return null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Non connecté", { status: 401 });
  const { id } = await ctx.params;
  const card = await prisma.card.findFirst({
    where: { id, active: true },
    include: { subject: { select: { image: true, consent: true, birthMonth: true, birthDay: true } } },
  });
  if (!card) return new Response("Carte introuvable", { status: 404 });
  const c = toCardView(card);
  const r = RARITIES[c.rarity];
  const el = ELEMENTS[c.element];
  const art = imageSource(c.imageUrl);
  const initials = c.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const number = `#${String(c.number).padStart(3, "0")}`;

  // Seuls les caractères affichés sont téléchargés (alphabet complet en majuscules et minuscules pour les étiquettes)
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÉÈÊÀÂÎÏÔÛÙÇéèêàâîïôûùç0123456789 ·«»!#'-";
  const chars = `${c.name}${c.title}${initials}${el.label}${el.kanji}${SITE_NAME}${alphabet}絆`;
  const [display, body] = await Promise.all([googleFont("Mochiy Pop One", 400, chars), googleFont("M PLUS Rounded 1c", 800, chars)]);
  const fonts = [
    ...(display ? [{ name: "Display", data: display, weight: 400 as const, style: "normal" as const }] : []),
    ...(body ? [{ name: "Body", data: body, weight: 800 as const, style: "normal" as const }] : []),
  ];
  const D = display ? "Display" : "sans-serif";
  const B = body ? "Body" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(180deg, #140f3a 0%, #2d1b69 40%, #7a2c86 70%, #e0617d 92%, #ffb38a 100%)", fontFamily: B, color: "#fff",
        }}
      >
        <div style={{ display: "flex", padding: 14, borderRadius: 44, background: FRAMES[c.rarity], boxShadow: GLOWS[c.rarity] }}>
          <div
            style={{
              width: 480, height: 672, borderRadius: 34, display: "flex", flexDirection: "column", overflow: "hidden",
              background: `radial-gradient(circle at 50% 22%, ${el.color}, ${TINTS[c.rarity]} 60%, #140f3a)`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px" }}>
              <span style={{ fontSize: 26 }}>{number}</span>
              <span style={{ fontSize: 22, padding: "4px 18px", borderRadius: 999, background: TINTS[c.rarity], border: "2px solid rgba(255,255,255,.6)" }}>
                {r.label.toUpperCase()}
              </span>
              <span style={{ width: 50, height: 50, borderRadius: 25, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, background: "rgba(20,12,60,.55)", border: "2px solid rgba(255,255,255,.7)" }}>
                {el.kanji}
              </span>
            </div>
            <div
              style={{
                display: "flex", flex: 1, margin: "0 22px", borderRadius: 24, overflow: "hidden", alignItems: "center", justifyContent: "center",
                border: "3px solid rgba(255,255,255,.55)", background: `radial-gradient(circle at 50% 42%, #ffffff, ${el.color} 40%, ${TINTS[c.rarity]})`,
              }}
            >
              {art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={art} width={430} height={430} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
              ) : (
                <span style={{ fontFamily: D, fontSize: 170, textShadow: `0 8px 0 ${TINTS[c.rarity]}` }}>{initials}</span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", padding: "16px 24px 22px" }}>
              <span style={{ fontFamily: D, fontSize: 46, lineHeight: 1.1, textShadow: `0 4px 0 ${TINTS[c.rarity]}` }}>{c.name}</span>
              {c.title ? <span style={{ fontSize: 22, opacity: 0.9 }}>« {c.title} »</span> : null}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 24 }}>
                <span>ATK {c.attack}</span>
                <span>{el.label}</span>
                <span>DEF {c.defense}</span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 34, fontSize: 28 }}>
          <span style={{ fontFamily: D, fontSize: 40, marginRight: 16 }}>絆 {SITE_NAME}</span>
          <span style={{ opacity: 0.9 }}>· Les cartes de la communauté</span>
        </div>
      </div>
    ),
    {
      width: 800,
      height: 1000,
      fonts: fonts.length ? fonts : undefined,
      headers: { "Cache-Control": "private, max-age=300" },
    },
  );
}
