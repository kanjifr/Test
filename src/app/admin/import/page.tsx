import { requireStaff } from "@/lib/session";
import { BulkImport } from "@/components/BulkImport";
import { TEMPLATE_CSV } from "@/lib/import";

export const dynamic = "force-dynamic";

export default async function ImportAdmin() {
  await requireStaff("importCards");
  return (
    <section className="admin">
      <h1>📊 Import Excel</h1>
      <p className="muted">
        Crée ou modifie beaucoup de cartes d&apos;un coup avec le modèle Excel (onglet « Mode d&apos;emploi » inclus) : remplis-le,
        enregistre-le en CSV, puis envoie-le ici avec les images.
      </p>
      <BulkImport template={TEMPLATE_CSV} />
    </section>
  );
}
