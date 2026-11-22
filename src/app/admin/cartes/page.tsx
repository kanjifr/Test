import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/admin";
import { toCardView } from "@/lib/cards";
import { GameCard } from "@/components/GameCard";
import { ELEMENTS, ELEMENT_KEYS, RARITIES, RARITY_ORDER } from "@/lib/game";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MAX_VIDEO_MB } from "@/lib/uploads";
import { deleteCard, saveCard, seedDemo, toggleCard } from "../actions";
import { eventOver, frDate, inWindow, toParisDay } from "@/lib/series";

export const dynamic = "force-dynamic";

type Search = { nouvelle?: string; edit?: string; err?: string; ok?: string; nom?: string; membre?: string; rarete?: string; q?: string; serie?: string; filtre?: string; r?: string };

export default async function CardsAdmin({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireStaff("editCards");
  const sp = await searchParams;
  const { edit, err, ok, nom, membre, rarete } = sp;
  // Pré-remplissage depuis le résultat d'un vote (« Créer la carte »)
  const prefill = {
    name: nom?.slice(0, 40),
    subjectId: membre,
    rarity: RARITY_ORDER.includes(rarete as never) ? (rarete as (typeof RARITY_ORDER)[number]) : undefined,
  };
  const allow = { toggle: can(me.role, "toggleCards"), del: can(me.role, "deleteCards"), seed: can(me.role, "seedDemo") };

  // Filtres de la liste
  const q = (sp.q ?? "").trim().slice(0, 40);
  const rarityFilter = RARITY_ORDER.includes(sp.r as never) ? (sp.r as (typeof RARITY_ORDER)[number]) : null;
  const where: Prisma.CardWhereInput = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, ...(Number(q) ? [{ number: Number(q) }] : [])] } : {}),
    ...(rarityFilter ? { rarity: rarityFilter } : {}),
    ...(sp.serie === "none" ? { seriesId: null } : sp.serie ? { seriesId: sp.serie } : {}),
    ...(sp.filtre === "inactives" ? { active: false } : {}),
    ...(sp.filtre === "evenement" ? { eventName: { not: null } } : {}),
    ...(sp.filtre === "exclusives" ? { exclusive: true } : {}),
    ...(sp.filtre === "alternatives" ? { variantOfId: { not: null } } : {}),
    ...(sp.filtre === "sansimage" ? { imageUrl: null } : {}),
  };
  const [series, cards, allCards, consenting, total] = await Promise.all([
    prisma.series.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { cards: true } } } }),
    prisma.card.findMany({
      where,
      orderBy: { number: "asc" },
      include: { subject: { select: { image: true, consent: true, name: true, birthMonth: true, birthDay: true } }, _count: { select: { owners: true } } },
    }),
    // Pour le formulaire (carte modifiée, choix « version alternative de »)
    prisma.card.findMany({ orderBy: { number: "asc" }, select: { id: true, number: true, name: true, variantOfId: true } }),
    prisma.user.findMany({ where: { consent: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.card.count(),
  ]);
  const editing = edit ? await prisma.card.findUnique({ where: { id: edit } }) : null;
  const seriesName = new Map(series.map((x) => [x.id, x.name]));
  const qs = (o: Partial<Search>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: q || undefined, r: rarityFilter ?? undefined, serie: sp.serie, filtre: sp.filtre, ...o })) if (v) p.set(k, v);
    return `/admin/cartes${p.size ? `?${p}` : ""}`;
  };
  const filters = [
    ["", "Toutes"],
    ["inactives", "Désactivées"],
    ["evenement", "Événement"],
    ["exclusives", "Exclusives"],
    ["alternatives", "Alternatives"],
    ["sansimage", "Sans image"],
  ] as const;

  return (
    <section className="admin">
      <div className="page-head">
        <h1>🃏 Cartes</h1>
        {(editing || prefill.name) && (
          <Link href="/admin/cartes?nouvelle=1" className="btn btn-ghost btn-sm">
            ＋ Nouvelle carte
          </Link>
        )}
      </div>
      {err && <p className="error">{err}</p>}
      {ok && <p className="success">{ok === "1" ? "Carte enregistrée ✔" : ok}</p>}

      <div className="cards-admin">
        <details className="panel card-drawer" open={!!(editing || prefill.name || err || sp.nouvelle)}>
          <summary>{editing ? `✏️ Modifier #${editing.number} ${editing.name}` : "＋ Nouvelle carte"}</summary>
        <form action={saveCard} className="card-form" id="carte" key={editing?.id ?? `new-${prefill.name ?? ""}`}>
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
          <fieldset className="video-field">
            <legend>Série, événement, version alternative</legend>
            <label>
              Série
              <select name="seriesId" defaultValue={editing ? (editing.seriesId ?? "") : (series.at(-1)?.id ?? "")}>
                <option value="">— Hors série —</option>
                {series.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.inBoosters ? "" : " (hors boosters)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Carte d&apos;événement (facultatif)
              <input name="eventName" maxLength={30} defaultValue={editing?.eventName ?? ""} placeholder="ex : Halloween" />
            </label>
            <div className="row">
              <label>
                Disponible du
                <input type="date" name="availableFrom" defaultValue={toParisDay(editing?.availableFrom)} />
              </label>
              <label>
                au (inclus)
                <input type="date" name="availableUntil" defaultValue={toParisDay(editing?.availableUntil)} />
              </label>
            </div>
            <label className="switch">
              <input type="checkbox" name="exclusive" defaultChecked={editing?.exclusive ?? false} />
              <span>Exclusive : ne sort jamais des boosters (cartes de Noël du calendrier de l&apos;Avent…)</span>
            </label>
            <small className="muted">
              En dehors de ces dates, la carte ne sort plus des boosters : elle ne s&apos;obtient que par échange. Pendant
              l&apos;événement, elle sort 3 fois plus souvent que les autres cartes de sa rareté.
            </small>
            <label>
              Version alternative de…
              <select name="variantOfId" defaultValue={editing?.variantOfId ?? ""}>
                <option value="">— Non, c&apos;est une carte normale —</option>
                {allCards
                  .filter((c) => !c.variantOfId && c.id !== editing?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      #{String(c.number).padStart(3, "0")} {c.name}
                    </option>
                  ))}
              </select>
              <small className="muted">Même personne, autre style. Elle sort 2,5 fois moins souvent que les autres cartes de sa rareté.</small>
            </label>
          </fieldset>
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
              <Link href="/admin/cartes" className="btn btn-ghost">
                Annuler
              </Link>
            )}
          </div>
        </form>
        </details>

        <div className="admin-cards-col">
          <form className="admin-toolbar" method="get">
            <input type="search" name="q" defaultValue={q} placeholder="Nom, titre ou numéro…" aria-label="Rechercher une carte" />
            <select name="r" defaultValue={rarityFilter ?? ""} aria-label="Rareté">
              <option value="">Toutes raretés</option>
              {RARITY_ORDER.map((r) => (
                <option key={r} value={r}>
                  {RARITIES[r].label}
                </option>
              ))}
            </select>
            <select name="serie" defaultValue={sp.serie ?? ""} aria-label="Série">
              <option value="">Toutes séries</option>
              {series.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
              <option value="none">Hors série</option>
            </select>
            {sp.filtre && <input type="hidden" name="filtre" value={sp.filtre} />}
            <button className="btn btn-sm">Filtrer</button>
          </form>
          <div className="chips">
            {filters.map(([v, label]) => (
              <Link key={v} className={`chip ${(sp.filtre ?? "") === v ? "on" : ""}`} href={qs({ filtre: v || undefined })}>
                {label}
              </Link>
            ))}
          </div>
          <p className="muted small-text">
            {cards.length} carte{cards.length > 1 ? "s" : ""} affichée{cards.length > 1 ? "s" : ""} sur {total}
          </p>
          {total === 0 && allow.seed && (
            <form action={seedDemo} className="panel">
              <p>Aucune carte. Tu peux créer 12 cartes d&apos;exemple pour tester le site.</p>
              <button type="submit" className="btn">
                Créer les cartes de démo
              </button>
            </form>
          )}
          <ul className="admin-card-list">
            {cards.map((c) => (
              <li key={c.id} className={`${c.active ? "" : "inactive"} ${editing?.id === c.id ? "editing" : ""}`}>
                <GameCard card={toCardView(c)} size="xs" />
                <div className="admin-card-info">
                  <b>
                    #{String(c.number).padStart(3, "0")} {c.name}
                  </b>
                  <span className="small-text" style={{ color: RARITIES[c.rarity].color }}>
                    {RARITIES[c.rarity].label} · {ELEMENTS[c.element].label} · {c.attack}/{c.defense}
                    {!c.active && <span className="muted"> · désactivée</span>}
                  </span>
                  <span className="muted small-text">
                    {c.seriesId ? seriesName.get(c.seriesId) : "Hors série"}
                    {c.eventName &&
                      ` · ✿ ${c.eventName}${c.availableUntil ? (eventOver(c) ? " (terminé)" : inWindow(c) ? ` (jusqu'au ${frDate(c.availableUntil)})` : " (à venir)") : ""}`}
                    {c.variantOfId && " · ALT"}
                    {c.exclusive && " · exclusive"}
                    {" · "}
                    {c.subject ? c.subject.name : "pas de membre"} · {c._count.owners} possesseur{c._count.owners > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="admin-card-actions">
                  <Link href={`${qs({})}${qs({}).includes("?") ? "&" : "?"}edit=${c.id}`} className="btn btn-sm">
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
                      <ConfirmButton className="btn btn-sm btn-danger" message={`Supprimer ${c.name} ? Elle disparaîtra de toutes les collections.`}>
                        Supprimer
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
