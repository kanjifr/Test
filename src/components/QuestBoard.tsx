"use client";

import { useState, useTransition } from "react";
import { claimQuest } from "@/app/actions";
import { play } from "@/lib/sfx";

export type QuestView = { id: string; label: string; icon: string; value: number; target: number; done: boolean; claimed: boolean };

/** Événement écouté par le PackOpener pour mettre à jour le nombre de boosters bonus. */
export const BONUS_EVENT = "kizuna:bonus";

export function QuestBoard({ quests, reward, endsAt }: { quests: QuestView[]; reward: number; endsAt: number }) {
  const [list, setList] = useState(quests);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const days = Math.max(0, Math.ceil((endsAt - Date.now()) / 86400_000));

  function claim(id: string) {
    start(async () => {
      const res = await claimQuest(id);
      if (res.ok) {
        play("rare");
        setList((l) => l.map((q) => (q.id === id ? { ...q, claimed: true } : q)));
        setMsg({ ok: true, text: `🎁 +${reward} booster${reward > 1 ? "s" : ""} bonus !` });
        window.dispatchEvent(new CustomEvent(BONUS_EVENT, { detail: res.bonus }));
      } else setMsg({ ok: false, text: res.error });
    });
  }

  return (
    <section className="panel quests" aria-label="Quêtes de la semaine">
      <div className="quests-head">
        <h2>📜 Quêtes de la semaine</h2>
        <span className="muted small-text">
          Nouvelles quêtes {days <= 1 ? "demain" : `dans ${days} jours`} · {reward} booster{reward > 1 ? "s" : ""} bonus par quête
        </span>
      </div>
      <ul className="quest-list">
        {list.map((q) => (
          <li key={q.id} className={q.claimed ? "claimed" : q.done ? "done" : ""}>
            <span className="quest-icon" aria-hidden>
              {q.icon}
            </span>
            <span className="quest-body">
              <span className="quest-label">{q.label}</span>
              <span className="quest-bar" role="img" aria-label={`${q.value} sur ${q.target}`}>
                <span style={{ width: `${(q.value / q.target) * 100}%` }} />
              </span>
            </span>
            {q.claimed ? (
              <span className="quest-state">✓ Récupéré</span>
            ) : q.done ? (
              <button type="button" className="btn btn-sm" disabled={pending} onClick={() => claim(q.id)}>
                🎁 Récupérer
              </button>
            ) : (
              <span className="quest-state muted">
                {q.value}/{q.target}
              </span>
            )}
          </li>
        ))}
      </ul>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
    </section>
  );
}
