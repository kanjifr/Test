import NextAuth, { type DefaultSession } from "next-auth";
import Discord, { type DiscordProfile } from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { staffRole, type StaffRole } from "@/lib/admin";
import { checkAchievements } from "@/lib/achievements-server";

declare module "next-auth" {
  interface Session {
    user: { id: string; discordId: string | null; staffRole: StaffRole | null } & DefaultSession["user"];
  }
  interface User {
    discordId?: string | null;
  }
}

function discordAvatar(p: DiscordProfile): string {
  if (p.avatar) {
    const ext = p.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.${ext}?size=512`;
  }
  const idx = Number((BigInt(p.id) >> BigInt(22)) % BigInt(6));
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

const providers: Provider[] = [
  Discord({
    authorization: { params: { scope: "identify guilds" } },
    profile(p: DiscordProfile) {
      return {
        id: p.id,
        name: p.global_name ?? p.username,
        email: null,
        image: discordAvatar(p),
        discordId: p.id,
      };
    },
  }),
];

const devLoginEnabled =
  process.env.DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Connexion de test",
      credentials: { name: { label: "Pseudo" } },
      async authorize(creds) {
        const name = String(creds?.name ?? "").trim().slice(0, 32);
        if (!/^[\w-]{2,32}$/.test(name)) return null;
        const discordId = `dev-${name.toLowerCase()}`;
        return prisma.user.upsert({
          where: { discordId },
          update: {},
          create: { discordId, name, image: null },
        });
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async signIn({ account }) {
      if (account?.provider !== "discord") return true;
      const guildId = process.env.DISCORD_GUILD_ID;
      if (!guildId) return true;
      try {
        const res = await fetch("https://discord.com/api/users/@me/guilds", {
          headers: { Authorization: `Bearer ${account.access_token}` },
        });
        if (!res.ok) return false;
        const guilds = (await res.json()) as { id: string }[];
        return guilds.some((g) => g.id === guildId);
      } catch {
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.discordId = user.discordId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.discordId = (token.discordId as string | null) ?? null;
      const db = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
      session.user.staffRole = staffRole(session.user.discordId, db?.role);
      return session;
    },
  },
  events: {
    // Met à jour pseudo + avatar à chaque connexion Discord, et rattrape les succès
    async signIn({ user, account, profile }) {
      if (user?.id) await checkAchievements(user.id).catch(() => {});
      if (account?.provider !== "discord" || !profile) return;
      const p = profile as unknown as DiscordProfile;
      await prisma.user.updateMany({
        where: { discordId: p.id },
        data: { name: p.global_name ?? p.username, image: discordAvatar(p) },
      });
    },
  },
});

export const DEV_LOGIN_ENABLED = devLoginEnabled;
