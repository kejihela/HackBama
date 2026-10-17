import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getViewer } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { SellForm } from "@/components/SellForm";

type Props = {
  params: Promise<{ campus: string }>;
  searchParams: Promise<{ category?: string; visibility?: string }>;
};

export default async function Sell({ params, searchParams }: Props) {
  const { campus } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(`/c/${campus}/login?next=/c/${campus}/sell`);
  const home = (await getTenant(viewer.tenant_id))!;

  return (
    <main className="wrap page" style={{ maxWidth: 760 }}>
      <SellForm
        campus={campus}
        homeName={home.short_name}
        categories={CATEGORIES.filter((c) => home.categories.includes(c.key)).map(({ key, label }) => ({ key, label }))}
        meetupSpot={home.meetup_spots[0]}
        defaultCategory={sp.category ?? "textbooks"}
        defaultVisibility={sp.visibility ?? "campus"}
      />
    </main>
  );
}
