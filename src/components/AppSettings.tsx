"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/push-actions";
import { INSTALL_EVENT } from "@/components/PwaRegister";

type Platform = "ios" | "android" | "other";
type PushState = "loading" | "unsupported" | "ios-needs-install" | "denied" | "on" | "off";

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

export function AppSettings({ vapidKey }: { vapidKey: string }) {
  const [plat, setPlat] = useState<Platform>("other");
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [push, setPush] = useState<PushState>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setPlat(platform());
    setInstalled(isStandalone());
    const sync = () => setCanPrompt(!!window.__kizunaInstall);
    sync();
    window.addEventListener(INSTALL_EVENT, sync);
    (async () => {
      // Sur iPhone, les notifications n'existent que dans l'application installée (iOS 16.4 et plus)
      if (platform() === "ios" && !isStandalone()) return setPush("ios-needs-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setPush("unsupported");
      }
      if (Notification.permission === "denied") return setPush("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    })().catch(() => setPush("unsupported"));
    return () => window.removeEventListener(INSTALL_EVENT, sync);
  }, []);

  async function install() {
    const p = window.__kizunaInstall;
    if (!p) return;
    await p.prompt();
    const { outcome } = await p.userChoice;
    window.__kizunaInstall = null;
    setCanPrompt(false);
    if (outcome === "accepted") setInstalled(true);
  }

  function enable() {
    setMsg(null);
    start(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setPush(perm === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) }));
        const res = await savePushSubscription(sub.toJSON());
        setPush(res.ok ? "on" : "off");
        if (!res.ok) setMsg("L'activation a échoué, réessaie.");
      } catch {
        setMsg("Ton navigateur a refusé l'activation des notifications.");
      }
    });
  }

  function disable() {
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setPush("off");
    });
  }

  return (
    <div className="app-settings">
      <div className="app-block">
        <h4>📱 Installer l&apos;application</h4>
        {installed ? (
          <p className="success">✓ Tu utilises l&apos;application installée.</p>
        ) : canPrompt ? (
          <button type="button" className="btn" onClick={install}>
            Installer Kizuna sur cet appareil
          </button>
        ) : plat === "ios" ? (
          <ol className="small-text install-steps">
            <li>
              Ouvre le site dans <b>Safari</b>.
            </li>
            <li>
              Appuie sur le bouton <b>Partager</b> <span aria-hidden>(carré avec une flèche ↑)</span>.
            </li>
            <li>
              Choisis <b>« Sur l&apos;écran d&apos;accueil »</b>, puis <b>Ajouter</b>.
            </li>
            <li>Ouvre Kizuna depuis l&apos;icône, puis reviens ici pour activer les notifications.</li>
          </ol>
        ) : plat === "android" ? (
          <p className="small-text muted">
            Dans Chrome : menu <b>⋮</b> → <b>« Ajouter à l&apos;écran d&apos;accueil »</b> (ou « Installer l&apos;application »).
          </p>
        ) : (
          <p className="small-text muted">
            Sur ordinateur : clique sur l&apos;icône d&apos;installation dans la barre d&apos;adresse (Chrome, Edge). Sur téléphone, ouvre le
            site dans Safari (iPhone) ou Chrome (Android).
          </p>
        )}
      </div>

      <div className="app-block">
        <h4>🔔 Notifications sur cet appareil</h4>
        {push === "loading" && <p className="muted small-text">…</p>}
        {push === "unsupported" && <p className="muted small-text">Ce navigateur ne gère pas les notifications.</p>}
        {push === "ios-needs-install" && (
          <p className="muted small-text">Sur iPhone, installe d&apos;abord l&apos;application (ci-dessus) et ouvre-la depuis l&apos;écran d&apos;accueil.</p>
        )}
        {push === "denied" && (
          <p className="muted small-text">
            Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur (ou de l&apos;iPhone : Réglages →
            Notifications → Kizuna), puis recharge la page.
          </p>
        )}
        {push === "off" && (
          <button type="button" className="btn" disabled={pending} onClick={enable}>
            Activer les notifications
          </button>
        )}
        {push === "on" && (
          <p className="row">
            <span className="success">✓ Activées</span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={disable}>
              Désactiver sur cet appareil
            </button>
          </p>
        )}
        {msg && <p className="error">{msg}</p>}
      </div>
    </div>
  );
}
