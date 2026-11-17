import { NextRequest } from "next/server";
import { handlers } from "@/auth";

export const { POST } = handlers;

// Discord ajoute désormais un paramètre `iss` (RFC 9207) au retour de connexion.
// Auth.js le compare à une valeur par défaut ("https://authjs.dev") et rejette la connexion.
// On vérifie qu'il provient bien de Discord, puis on le retire avant de passer la main à Auth.js.
const DISCORD_ISSUER = /^https:\/\/(?:[a-z0-9-]+\.)*discord\.com(?:\/|$)/i;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/callback/discord") && url.searchParams.has("iss")) {
    const iss = url.searchParams.get("iss") ?? "";
    if (!DISCORD_ISSUER.test(iss)) {
      return new Response("Émetteur de connexion invalide.", { status: 400 });
    }
    url.searchParams.delete("iss");
    return handlers.GET(new NextRequest(url, { headers: req.headers, method: "GET" }));
  }
  return handlers.GET(req);
}
