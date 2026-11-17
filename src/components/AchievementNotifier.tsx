import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { badgeView, type BadgeView } from "@/lib/achievements";
import { AchievementToasts } from "@/components/AchievementToasts";

export async function AchievementNotifier() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const unseen = await prisma.userAchievement.findMany({
    where: { userId: session.user.id, seen: false },
    orderBy: { unlockedAt: "asc" },
  });
  const items = unseen.map((u) => badgeView(u.achievementId)).filter((b): b is BadgeView => b !== null);
  return <AchievementToasts items={items} />;
}
