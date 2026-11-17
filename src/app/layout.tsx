import type { Metadata } from "next";
import { Shippori_Mincho_B1, Zen_Kaku_Gothic_New } from "next/font/google";
import { Nav } from "@/components/Nav";
import { AchievementNotifier } from "@/components/AchievementNotifier";
import { SITE_NAME } from "@/lib/game";
import "./globals.css";

const display = Shippori_Mincho_B1({
  subsets: ["latin"],
  weight: ["600", "800"],
  variable: "--font-display",
});
const body = Zen_Kaku_Gothic_New({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: `${SITE_NAME} · Cartes de la communauté`,
  description: "Ouvre des boosters et collectionne les cartes des membres de la communauté.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="sky" aria-hidden />
        <Nav />
        <main className="main">{children}</main>
        <AchievementNotifier />
      </body>
    </html>
  );
}
