import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { getReadUrl } from "@/lib/r2";
import { resolveDesignImageAssetId } from "@/lib/designs";
import { Icon } from "@/components/ui/Icon/Icon";
import { PresentationTabs } from "@/components/designs/PresentationTabs/PresentationTabs";
import type { Asset, Client, Design, Project } from "@/lib/types";
import styles from "./page.module.css";

type PageProps = { params: Promise<{ id: string }> };

export default async function DesignPresentPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createSupabaseClient();

  const { data: designData } = await supabase
    .from("designs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!designData) notFound();
  const design = designData as Design;

  const { data: projectData } = await supabase
    .from("projects")
    .select("id, name, client_id")
    .eq("id", design.project_id)
    .maybeSingle();

  if (!projectData) notFound();
  const project = projectData as Pick<Project, "id" | "name" | "client_id">;

  const { data: clientData } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", project.client_id)
    .maybeSingle();
  const client = clientData as Pick<Client, "id" | "name"> | null;

  const imageAssetId = resolveDesignImageAssetId(design);

  let flatImageUrl: string | null = null;
  if (imageAssetId) {
    const { data: assetData } = await supabase
      .from("assets")
      .select("*")
      .eq("id", imageAssetId)
      .maybeSingle();

    if (assetData) flatImageUrl = await getReadUrl((assetData as Asset).r2_key);
  }

  return (
    <main className={styles.page}>
      <Link className={styles.back} href={`/designs/${design.id}`}>
        <Icon name="arrowBack" size={16} />
        {design.name}
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>{design.name}</h1>
        <p className={styles.subtitle}>
          {client?.name} · {project.name}
        </p>
      </div>

      <PresentationTabs
        designName={design.name}
        flatImageUrl={flatImageUrl}
        projectId={project.id}
      />
    </main>
  );
}
