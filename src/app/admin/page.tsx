import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can, ROLE_LABELS, staffRole } from "@/lib/admin";
import { toCardView } from "@/lib/cards";
import { GameCard } from "@/components/GameCard";
import { ELEMENTS, ELEMENT_KEYS, RARITIES, RARITY_ORDER } from "@/lib/game";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MAX_VIDEO_MB } from "@/lib/uploads";
import { BulkImport } from "@/components/BulkImport";
import { TEMPLATE_CSV } from "@/lib/import";
import { lastBackupSent, webhookConfigured } from "@/lib/backup";
import { restoreFromBackup, sendBackupNow } from "./backup-actions";
import { closePoll, createPoll, deletePoll } from "./poll-actions";
import { approveAnecdote, deleteAnecdote } from "@/app/carte/actions";
import { isOpen, pollInclude, results } from "@/lib/polls";
import { saveAnnounceSettings, sendTestAnnouncement } from "./announce-actions";
import { announceConfigured } from "@/lib/announce";
import { getAnnounceSettings } from "@/lib/settings";
import { deleteCard, resetCollection, resetCooldown, saveCard, seedDemo, setRole, toggleCard } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; err?: string; ok?: string; nom?: string; membre?: string; rarete?: string }>;
}) {
  const me = await requireStaff("viewPanel");
  const { edit, err, ok, nom, membre, rarete } = await searchParams;
  // Pré-remplissage depuis le résultat d'un vote (« Créer la carte »)
  const prefill = {
    name: nom?.slice(0, 40),
    subjectId: membre,
    rarity: RARITY_ORDER.includes(rarete as never) ? (rarete as (typeof RARITY_ORDER)[number]) : undefined,
  };
  const allow = {
    toggle: can(me.role, "toggleCards"),
    del: can(me.role, "deleteCards"),
    gift: can(me.role, "giftBoosters"),
    reset: can(me.role, "resetCollections"),
    import: can(me.role, "importCards"),
    polls: can(me.role, "managePolls"),
    anecdotes: can(me.role, "moderateAnecdotes"),
    backups: can(me.role, "manageBackups"),
    announce: can(me.role, "manageAnnouncements"),
    seed: can(me.role, "seedDemo"),
    log: can(me.role, "viewLog"),
    roles: can(me.role, "manageRoles"),
  };

  const lastBackup = allow.backups ? await lastBackupSent() : null;
  const pendingAnecdotes = allow.anecdotes
    ? await prisma.anecdote.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 50,
        include: { card: { select: { id: true, name: true, number: true } }, author: { select: { name: true } } },
      })
    : [];
  const polls = allow.polls ? await prisma.poll.findMany({ include: pollInclude, orderBy: { createdAt: "desc" }, take: 12 }) : [];
  const announceSettings = allow.announce ? await getAnnounceSettings() : null;
  const [cards, members, stats, logs] = await Promise.all([
    prisma.card.findMany({
      orderBy: { number: "asc" },
      include: {
        subject: { select: { image: true, consent: true, name: true, birthMonth: true, birthDay: true } },
        _count: { select: { owners: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        consent: true,
        packsOpened: true,
        bonusPacks: true,
        lastPackAt: true,
        role: true,
        discordId: true,
        _count: { select: { cards: true } },
      },
    }),
    prisma.user.aggregate({ _sum: { packsOpened: true }, _count: true }),
    allow.log ? prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }) : Promise.resolve([]),
  ]);
  const editing = edit ? cards.find((c) => c.id === edit) : undefined;
  const consenting = members.filter((m) => m.consent);

  return (
    <section className="admin">
      <h1>Panel admin</h1>
      <p className="muted">
        Connecté en tant que <b className="role-chip">{ROLE_LABELS[me.role]}</b>
        {me.role === "MODERATOR" && " : tu peux créer et modifier des cartes."}
      </p>
      <div className="stats">
        <div>
          <b>{stats._count}</b> membres
        </div>
        <div>
          <b>{cards.length}</b> cartes
        </div>
        <div>
          <b>{stats._sum.packsOpened ?? 0}</b> boosters ouverts
        </div>
      </div>

      {err && <p className="error">{err}</p>}
      {ok && <p className="success">{ok === "1" ? "Carte enregistrée ✔" : ok}</p>}

      <div className="admin-cols">
        <form action={saveCard} className="panel card-form" id="carte" key={editing?.id ?? `new-${prefill.name ?? ""}`}>
          <h2>{editing ? `Modifier #${editing.number} ${editing.name}` : "Nouvelle carte"}</h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label>
            Nom *
            <input name="name" required maxLength={40} defaultValue={editing?.name ?? prefill.name} />
          </label>
          <label>
            Titre / surnom
            <input name="title" maxLength={40} defaultValue={editing?.title} placeholder="ex : La lame du crépuscule" />
          </label>
          <label>
            Description
            <textarea name="description" maxLength={300} rows={3} defaultValue={editing?.description} />
          </label>
          <div className="row">
            <label>
              Rareté
              <select name="rarity" defaultValue={editing?.rarity ?? prefill.rarity ?? "COMMUNE"}>
                {RARITY_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {RARITIES[r].label} ({r === "MYTHIQUE" ? "pity" : `${RARITIES[r].weight}%`})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Élément
              <select name="element" defaultValue={editing?.element ?? "EAU"}>
                {ELEMENT_KEYS.map((e) => (
                  <option key={e} value={e}>
                    {ELEMENTS[e].kanji} {ELEMENTS[e].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label>
              Attaque
              <input type="number" name="attack" min={0} max={999} defaultValue={editing?.attack ?? 50} />
            </label>
            <label>
              Défense
              <input type="number" name="defense" min={0} max={999} defaultValue={editing?.defense ?? 50} />
            </label>
          </div>
          <label>
            Membre représenté (avatar Discord utilisé si pas d&apos;image)
            <select name="subjectId" defaultValue={editing?.subjectId ?? prefill.subjectId ?? ""}>
              <option value="">— Aucun —</option>
              {consenting.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <small className="muted">Seuls les membres ayant accepté dans leur profil apparaissent ici.</small>
          </label>
          <label>
            Image (PNG, JPG, WEBP, GIF · 5 Mo max)
            <input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" />
          </label>
          <label>
            … ou URL d&apos;image (https://)
            <input
              name="imageUrl"
              type="url"
              defaultValue={editing?.imageUrl?.startsWith("https://") ? editing.imageUrl : ""}
            />
          </label>
          {editing?.imageUrl && (
            <label className="switch">
              <input type="checkbox" name="removeImage" />
              <span>Retirer l&apos;image actuelle</span>
            </label>
          )}
          <fieldset className="video-field">
            <legend>Vidéo d&apos;obtention · Mythique uniquement</legend>
            <p className="muted small-text">
              Jouée en plein écran quand un membre obtient la carte, puis en boucle dans la carte. MP4 ou WEBM, {MAX_VIDEO_MB} Mo
              max. Ignorée pour les autres raretés.
            </p>
            {editing?.videoUrl && (
              <video className="video-preview" src={editing.videoUrl} muted loop autoPlay playsInline />
            )}
            <label>
              Fichier vidéo
              <input type="file" name="video" accept="video/mp4,video/webm" />
            </label>
            <label>
              … ou URL de vidéo (https://…mp4)
              <input
                name="videoUrl"
                type="url"
                defaultValue={editing?.videoUrl?.startsWith("https://") ? editing.videoUrl : ""}
              />
            </label>
            {editing?.videoUrl && (
              <label className="switch">
                <input type="checkbox" name="removeVideo" />
                <span>Retirer la vidéo actuelle</span>
              </label>
            )}
          </fieldset>
          <div className="row">
            <button type="submit" className="btn">
              {editing ? "Enregistrer" : "Créer la carte"}
            </button>
            {editing && (
              <Link href="/admin" className="btn btn-ghost">
                Annuler
              </Link>
            )}
          </div>
        </form>

        <div className="admin-cards">
          {cards.length === 0 && allow.seed && (
            <form action={seedDemo} className="panel">
              <p>Aucune carte. Tu peux créer 12 cartes d&apos;exemple pour tester le site.</p>
              <button type="submit" className="btn">
                Créer les cartes de démo
              </button>
            </form>
          )}
          {cards.map((c) => (
            <div key={c.id} className={`admin-card ${c.active ? "" : "inactive"}`}>
              <GameCard card={toCardView(c)} size="sm" />
              <div className="admin-card-info">
                <b>{c.name}</b>
                <span className="muted">
                  {c.subject ? `Membre : ${c.subject.name}` : "Pas de membre lié"} · {c._count.owners} possesseurs
                </span>
                <div className="row">
                  <Link href={`/admin?edit=${c.id}`} className="btn btn-sm">
                    Modifier
                  </Link>
                  {allow.toggle && (
                    <form action={toggleCard}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn btn-sm btn-ghost">{c.active ? "Désactiver" : "Activer"}</button>
                    </form>
                  )}
                  {allow.del && (
                  <form action={deleteCard}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton
                      className="btn btn-sm btn-danger"
                      message={`Supprimer ${c.name} ? Elle disparaîtra de toutes les collections.`}
                    >
                      Supprimer
                    </ConfirmButton>
                  </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {allow.anecdotes && (
        <div className="panel admin-anecdotes" id="livre-d-or">
          <h2>
            📖 Livre d&apos;or <span className="muted">({pendingAnecdotes.length} en attente)</span>
          </h2>
          {pendingAnecdotes.length === 0 ? (
            <p className="muted">Aucune anecdote à valider. Les anecdotes publiées se modifient directement sur la fiche de chaque carte.</p>
          ) : (
            <ul className="admin-anecdote-list">
              {pendingAnecdotes.map((a) => (
                <li key={a.id}>
                  <p className="small-text">
                    <b>{a.author?.name ?? "Ancien membre"}</b> sur{" "}
                    <a href={`/carte/${a.card.id}#livre-d-or`}>
                      #{String(a.card.number).padStart(3, "0")} {a.card.name}
                    </a>{" "}
                    <span className="muted">· {a.createdAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>
                  </p>
                  <form action={approveAnecdote} className="anecdote-edit">
                    <input type="hidden" name="id" value={a.id} />
                    <textarea name="text" defaultValue={a.text} maxLength={500} rows={2} aria-label="Texte de l'anecdote (modifiable avant validation)" />
                    <button className="btn btn-sm">✔ Valider</button>
                  </form>
                  <form action={deleteAnecdote}>
                    <input type="hidden" name="id" value={a.id} />
                    <ConfirmButton className="btn btn-sm btn-danger" message="Refuser et supprimer cette anecdote ?">
                      Refuser
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {allow.polls && (
        <div className="panel admin-polls" id="votes">
          <h2>🗳️ Votes de la communauté</h2>
          <form action={createPoll} className="poll-form">
            <label>
              Question
              <input name="question" required maxLength={140} placeholder="Qui aura la prochaine carte Mythique ?" />
            </label>
            <div className="row">
              <label>
                Choix proposés
                <select name="kind" defaultValue="MEMBERS">
                  <option value="MEMBERS">Des membres</option>
                  <option value="TEXT">Des textes (titres, phrases…)</option>
                </select>
              </label>
              <label>
                Rareté en jeu (facultatif)
                <select name="rarity" defaultValue="">
                  <option value="">—</option>
                  {RARITY_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {RARITIES[r].label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Durée (jours)
                <input name="days" type="number" min={1} max={14} defaultValue={3} />
              </label>
            </div>
            <fieldset className="poll-members">
              <legend>Membres proposés (si « Des membres ») · seuls ceux qui ont accepté d&apos;apparaître sur une carte</legend>
              {consenting.length === 0 ? (
                <p className="muted small-text">Aucun membre n&apos;a encore accepté d&apos;apparaître sur une carte.</p>
              ) : (
                consenting.map((m) => (
                  <label key={m.id} className="switch">
                    <input type="checkbox" name="members" value={m.id} defaultChecked />
                    <span>{m.name}</span>
                  </label>
                ))
              )}
            </fieldset>
            <label>
              Textes proposés (si « Des textes ») · un par ligne
              <textarea name="texts" rows={4} placeholder={"Le gardien du vocal\nLa reine des memes\nCelui qui ne dort jamais"} />
            </label>
            <div className="row">
              <button type="submit" className="btn">Lancer le vote</button>
            </div>
          </form>

          {polls.length > 0 && (
            <ul className="admin-poll-list">
              {polls.map((p) => {
                const r = results(p);
                const open = isOpen(p);
                const winner = r.winners.length === 1 ? r.winners[0] : null;
                return (
                  <li key={p.id}>
                    <div>
                      <b>{p.question}</b>
                      <span className="muted small-text">
                        {" "}
                        · {open ? "en cours" : "terminé"} · {r.total} vote(s)
                        {!open && (winner ? ` · gagnant : ${winner.label}` : r.winners.length > 1 ? " · égalité" : "")}
                      </span>
                    </div>
                    <div className="row">
                      {!open && winner && p.kind === "MEMBERS" && (
                        <a
                          className="btn btn-sm"
                          href={`/admin?nom=${encodeURIComponent(winner.label)}&membre=${winner.subjectId ?? ""}&rarete=${p.rarity ?? ""}#carte`}
                        >
                          Créer la carte
                        </a>
                      )}
                      {open && (
                        <form action={closePoll}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="btn btn-sm btn-ghost">Terminer maintenant</button>
                        </form>
                      )}
                      <form action={deletePoll}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmButton className="btn btn-sm btn-danger" message={`Supprimer le vote « ${p.question} » ?`}>
                          Supprimer
                        </ConfirmButton>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {allow.import && <BulkImport template={TEMPLATE_CSV} />}

      <div className="panel">
        <h2>Membres</h2>
        <table className="members">
          <thead>
            <tr>
              <th>Membre</th>
              <th>Rôle</th>
              <th>Accord carte</th>
              <th>Boosters</th>
              <th>Cartes</th>
              <th>Dernier booster</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const r = staffRole(m.discordId, m.role);
              return (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>
                  {allow.roles && r !== "OWNER" && m.id !== me.id ? (
                    <form action={setRole} className="role-form" key={m.role}>
                      <input type="hidden" name="userId" value={m.id} />
                      <select name="role" defaultValue={m.role} aria-label={`Rôle de ${m.name}`}>
                        <option value="MEMBER">{ROLE_LABELS.MEMBER}</option>
                        <option value="MODERATOR">{ROLE_LABELS.MODERATOR}</option>
                        <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
                      </select>
                      <button className="btn btn-sm btn-ghost">OK</button>
                    </form>
                  ) : (
                    <span className={r ? "role-chip" : "muted"}>{ROLE_LABELS[r ?? "MEMBER"]}</span>
                  )}
                </td>
                <td>{m.consent ? "✔ Oui" : "—"}</td>
                <td>
                  {m.packsOpened}
                  {m.bonusPacks > 0 && <span className="muted"> (+{m.bonusPacks} 🎁)</span>}
                </td>
                <td>{m._count.cards}</td>
                <td>{m.lastPackAt ? m.lastPackAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "—"}</td>
                <td>
                  <div className="member-actions">
                    {allow.gift && (
                      <form action={resetCooldown}>
                        <input type="hidden" name="userId" value={m.id} />
                        <button className="btn btn-sm btn-ghost">🎁 Offrir un booster</button>
                      </form>
                    )}
                    {allow.reset && (r !== "OWNER" || me.role === "OWNER") && (
                      <details className="reset-menu">
                        <summary className="btn btn-sm btn-danger">Réinitialiser…</summary>
                        <form action={resetCollection} className="reset-form">
                          <input type="hidden" name="userId" value={m.id} />
                          <p>
                            Supprime toutes les cartes de <b>{m.name}</b> ({m._count.cards} différente(s)) et annule ses
                            échanges en attente.
                          </p>
                          <label className="switch">
                            <input type="checkbox" name="achievements" />
                            <span>Réinitialiser aussi ses succès et son compteur de boosters</span>
                          </label>
                          <ConfirmButton
                            className="btn btn-sm btn-danger"
                            message={`Réinitialiser la collection de ${m.name} ? C'est définitif.`}
                          >
                            Confirmer la réinitialisation
                          </ConfirmButton>
                        </form>
                      </details>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {allow.roles && (
          <p className="muted small">
            <b>Admin</b> : tous les droits sauf la gestion des rôles. <b>Modérateur</b> : créer et modifier des cartes
            uniquement. Les propriétaires se définissent dans la variable <code>OWNER_DISCORD_IDS</code>.
          </p>
        )}
      </div>

      {allow.announce && announceSettings && (
        <div className="panel backups" id="annonces">
          <h2>📣 Annonces Discord</h2>
          {announceConfigured() ? (
            <p className="muted">
              Les annonces sont publiées dans le salon du webhook, environ 20 secondes après l&apos;événement pour ne rien
              spoiler. Les membres sont mentionnés sans être notifiés.
            </p>
          ) : (
            <p className="muted">
              Pas encore activées : crée un webhook dans le salon d&apos;annonces (Paramètres du salon → Intégrations →
              Webhooks) et ajoute son adresse dans la variable <code>ANNOUNCE_DISCORD_WEBHOOK_URL</code> sur Railway.
            </p>
          )}
          <form action={saveAnnounceSettings} className="announce-form" key={JSON.stringify(announceSettings)}>
            <label className="inline">
              Annoncer les tirages à partir de
              <select name="pulls" defaultValue={announceSettings.pulls}>
                <option value="EPIQUE">Épique</option>
                <option value="LEGENDAIRE">Légendaire</option>
                <option value="MYTHIQUE">Mythique seulement</option>
                <option value="OFF">Jamais</option>
              </select>
            </label>
            <label className="switch">
              <input type="checkbox" name="duels" defaultChecked={announceSettings.duels} />
              <span>Annoncer les victoires en duel</span>
            </label>
            <label className="switch">
              <input type="checkbox" name="trades" defaultChecked={announceSettings.trades} />
              <span>Annoncer les échanges réussis</span>
            </label>
            <label className="switch">
              <input type="checkbox" name="polls" defaultChecked={announceSettings.polls} />
              <span>Annoncer les nouveaux votes et leurs résultats</span>
            </label>
            <label className="switch">
              <input type="checkbox" name="birthdays" defaultChecked={announceSettings.birthdays} />
              <span>Souhaiter les anniversaires (vers 9 h)</span>
            </label>
            <div className="row">
              <button className="btn">Enregistrer</button>
            </div>
          </form>
          {announceConfigured() && (
            <form action={sendTestAnnouncement}>
              <button className="btn btn-ghost btn-sm">Envoyer un message de test</button>
            </form>
          )}
        </div>
      )}

      {allow.backups && (
        <div className="panel backups" id="sauvegardes">
          <h2>Sauvegardes</h2>
          <p className="muted">
            Une sauvegarde contient les membres, les cartes, les collections, les échanges, les succès et le journal. Les
            images et vidéos restent dans le volume Railway.
          </p>
          <div className="backup-grid">
            <div>
              <h3>Télécharger</h3>
              <p className="muted small-text">Un fichier .json.gz à garder sur ton ordinateur ou ton cloud.</p>
              <a className="btn" href="/api/admin/backup">
                💾 Télécharger une sauvegarde
              </a>
            </div>
            <div>
              <h3>Automatique sur Discord</h3>
              {webhookConfigured() ? (
                <>
                  <p className="muted small-text">
                    Une sauvegarde par jour est envoyée dans ton salon privé.{" "}
                    {lastBackup
                      ? `Dernier envoi : ${lastBackup.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}.`
                      : "Aucun envoi pour le moment."}
                  </p>
                  <form action={sendBackupNow}>
                    <button className="btn btn-ghost">Envoyer maintenant</button>
                  </form>
                </>
              ) : (
                <p className="muted small-text">
                  Pas encore activée : ajoute la variable <code>BACKUP_DISCORD_WEBHOOK_URL</code> dans Railway (adresse
                  d&apos;un webhook d&apos;un salon Discord privé).
                </p>
              )}
            </div>
            <div>
              <h3>Restaurer</h3>
              <form action={restoreFromBackup} className="restore-form">
                <p className="small-text bad-text">
                  ⚠️ Remplace toutes les données actuelles par celles du fichier. Une copie de l&apos;état actuel est gardée
                  sur le serveur par sécurité.
                </p>
                <input type="file" name="backup" accept=".gz,.json,application/gzip,application/json" required />
                <input name="confirm" placeholder="Écris RESTAURER" autoComplete="off" required />
                <ConfirmButton className="btn btn-danger" message="Remplacer toutes les données du site par cette sauvegarde ?">
                  Restaurer
                </ConfirmButton>
              </form>
            </div>
          </div>
        </div>
      )}

      {allow.log && (
        <div className="panel log-panel">
          <h2>Journal des actions</h2>
          {logs.length === 0 ? (
            <p className="muted">Aucune action pour le moment.</p>
          ) : (
            <ul className="log">
              {logs.map((l) => (
                <li key={l.id}>
                  <time className="muted">
                    {l.createdAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}
                  </time>
                  <span>
                    <b>{l.actorName}</b> {l.details}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
