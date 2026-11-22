import { requireStaff } from "@/lib/session";
import { lastBackupSent, webhookConfigured } from "@/lib/backup";
import { ConfirmButton } from "@/components/ConfirmButton";
import { restoreFromBackup, sendBackupNow } from "../backup-actions";

export const dynamic = "force-dynamic";

export default async function BackupsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireStaff("manageBackups");
  const { ok, err } = await searchParams;
  const lastBackup = await lastBackupSent();
  return (
    <section className="admin">
      <h1>💾 Sauvegardes</h1>
      {err && <p className="error">{err}</p>}
      {ok && <p className="success">{ok}</p>}
        <div className="panel backups" id="sauvegardes">
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
    </section>
  );
}
