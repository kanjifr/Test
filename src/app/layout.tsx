import type { Metadata } from "next";
import { M_PLUS_Rounded_1c, Mochiy_Pop_One } from "next/font/google";
import { Nav } from "@/components/Nav";
import { AchievementNotifier } from "@/components/AchievementNotifier";
import { SITE_NAME } from "@/lib/game";
import "./globals.css";

const display = Mochiy_Pop_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});
const body = M_PLUS_Rounded_1c({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  // Adresse publique : nécessaire pour l'aperçu des liens partagés sur Discord
  metadataBase: process.env.AUTH_URL ? new URL(process.env.AUTH_URL) : undefined,
  title: `${SITE_NAME} · Cartes de la communauté`,
  description: "Ouvre des boosters et collectionne les cartes des membres de la communauté.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="sky" aria-hidden />
        <div className="petals" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <Nav />
        <main className="main">{children}</main>
        <AchievementNotifier />
      </body>
    </html>
  );
}
