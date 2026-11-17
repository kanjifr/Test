"use client";

import { useRef, useState, useTransition } from "react";
import { importCards, type ImportResult } from "@/app/admin/import-actions";
import { ELEMENTS, RARITIES } from "@/lib/game";
import type { Element, Rarity } from "@prisma/client";

export function BulkImport({ template }: { template: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  function run(mode: "check" | "import") {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("mode", mode);
    start(async () => setResult(await importCards(fd)));
  }

  function downloadTemplate() {
    const blob = new Blob(["﻿" + template], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modele-cartes.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const rows = result && "rows" in result ? result.rows : undefined;
  const errors = rows?.filter((r) => r.errors.length).length ?? 0;
  const checkedOk = result?.ok && !result.done && errors === 0;

  return (
    <div className="panel bulk">
      <h2>Import en masse</h2>
      <ol className="bulk-steps muted">
        <li>
          Prépare un tableau (Excel, Google Sheets…) avec une ligne par carte.{" "}
          <button type="button" className="linkish" onClick={downloadTemplate}>
            Télécharger le modèle
          </button>
        </li>
        <li>
          Colonnes : <code>nom</code>, <code>rarete</code>, <code>element</code> (obligatoires), puis <code>titre</code>,{" "}
          <code>description</code>, <code>attaque</code>, <code>defense</code>, <code>image</code>, <code>video</code>,{" "}
          <code>membre</code> (pseudo ou ID Discord).
        </li>
        <li>
          Dans <code>image</code> et <code>video</code>, mets une adresse <code>https://…</code> ou le nom d&apos;un fichier
          que tu envoies juste en dessous.
        </li>
        <li>Enregistre le tableau au format CSV, puis clique sur « Vérifier ». Rien n&apos;est importé avant ta confirmation.</li>
      </ol>
      <form ref={formRef} className="bulk-form" onChange={() => setResult(null)} onSubmit={(e) => e.preventDefault()}>
        <label>
          Tableau (.csv)
          <input type="file" name="csv" accept=".csv,text/csv" required />
        </label>
        <label>
          Images et vidéos (plusieurs fichiers possibles)
          <input type="file" name="files" multiple accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" />
          <small className="muted">100 Mo maximum par envoi : pour beaucoup d&apos;images, importe en plusieurs fois.</small>
        </label>
        <label className="switch">
          <input type="checkbox" name="updateExisting" />
          <span>Mettre à jour les cartes qui portent déjà le même nom</span>
        </label>
        <div className="row">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run("check")}>
            {pending ? "…" : "Vérifier"}
          </button>
          {checkedOk && (
            <button type="button" className="btn" disabled={pending} onClick={() => run("import")}>
              {pending ? "Import en cours…" : `Importer ${rows!.length} carte(s)`}
            </button>
          )}
        </div>
      </form>

      {result && !result.ok && <p className="error">{result.error}</p>}
      {result?.ok && result.done && (
        <p className="success">
          ✔ Import terminé : {result.created} carte(s) créée(s), {result.updated} mise(s) à jour.
        </p>
      )}
      {result?.ok && !result.done && (
        <p className={errors ? "error" : "success"}>
          {errors
            ? `${errors} ligne(s) à corriger sur ${rows!.length}. Corrige le tableau puis vérifie à nouveau.`
            : `Tout est bon : ${result.created} carte(s) à créer, ${result.updated} à mettre à jour.`}
        </p>
      )}
      {rows && rows.length > 0 && (
        <div className="bulk-table">
          <table className="members">
            <thead>
              <tr>
                <th>Ligne</th>
                <th>Nom</th>
                <th>Rareté</th>
                <th>Élément</th>
                <th>Image</th>
                <th>Membre</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className={r.errors.length ? "bad" : ""}>
                  <td>{r.line}</td>
                  <td>{r.name || "—"}</td>
                  <td style={{ color: r.rarity ? RARITIES[r.rarity as Rarity].color : undefined }}>
                    {r.rarity ? RARITIES[r.rarity as Rarity].label : "?"}
                  </td>
                  <td>{r.element ? ELEMENTS[r.element as Element].label : "?"}</td>
                  <td className="ellipsis">
                    {r.image || "—"}
                    {r.video ? ` + 🎬 ${r.video}` : ""}
                  </td>
                  <td>{r.member || "—"}</td>
                  <td>
                    {r.errors.length ? (
                      <span className="bad-text">{r.errors.join(" · ")}</span>
                    ) : r.action === "update" ? (
                      "Mise à jour"
                    ) : (
                      "Nouvelle carte"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
