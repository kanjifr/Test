import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/game";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} · Cartes de la communauté`,
    short_name: SITE_NAME,
    description: "Ouvre des boosters et collectionne les cartes des membres de la communauté.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#140f3a",
    theme_color: "#140f3a",
    lang: "fr",
    icons: [
      { src: "/app/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ouvrir un booster", url: "/", icons: [{ src: "/app/icon-192.png", sizes: "192x192" }] },
      { name: "Ma collection", url: "/collection", icons: [{ src: "/app/icon-192.png", sizes: "192x192" }] },
      { name: "Duels", url: "/duels", icons: [{ src: "/app/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
