import { requireStaff } from "@/lib/session";
import { can } from "@/lib/admin";
import { setTheme } from "../theme-actions";
import { getThemeChoice, seasonalTheme, THEMES } from "@/lib/theme";
import { saveAnnounceSettings, sendTestAnnouncement } from "../announce-actions";
import { announceConfigured } from "@/lib/announce";
import { getAnnounceSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireStaff("viewPanel");
  const { ok, err } = await searchParams;
  const allow = { theme: can(me.role, "manageTheme"), announce: can(me.role, "manageAnnouncements") };
  const [themeChoice, announceSettings] = await Promise.all([getThemeChoice(), allow.announce ? getAnnounceSettings() : null]);
  return (
    <section className="admin">
      <h1>⚙️ Thème et annonces</h1>
      {err && <p className="error">{err}</p>}
      {ok && <p className="success">{ok}</p>}
      {allow.theme && (
        <form action={setTheme} className="panel theme-panel" id="theme">
          <h2>🎨 Thème du site</h2>
          <p className="muted small-text">
            Change l&apos;apparence du site pour tout le monde (couleurs, ciel, flocons ou pétales). En automatique, Noël
            s&apos;active du 1er décembre au 6 janvier et Halloween du 20 au 31 octobre
            {themeChoice === "auto" && ` (en ce moment : ${THEMES[seasonalTheme()].label})`}.
          </p>
          <div className="theme-options">
            {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((k) => (
              <label key={k} className={`theme-option theme-${k}`}>
                <input type="radio" name="theme" value={k} defaultChecked={themeChoice === k} />
                <span>{THEMES[k].label}</span>
              </label>
            ))}
          </div>
          <button className="btn">Appliquer le thème</button>
        </form>
      )}

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
    </section>
  );
}
