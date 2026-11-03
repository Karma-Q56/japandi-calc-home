import { createFileRoute, redirect } from "@tanstack/react-router";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { useDemoState } from "@/data/useDemoState";
import { QrPrintPack } from "@/components/patron/QrPrintPack";
import { PageHeader } from "@/components/patron/dash";

export const Route = createFileRoute("/app/qr")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  ssr: false,
  component: QrOwner,
});

function QrOwner() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`${restaurant.name} · QR codes`}
        title="Print your QR pack"
        intro="Put your join code on tables, the counter and takeaway bags. Guests scan it and join your card."
      />
      <QrPrintPack restaurant={restaurant} />
    </main>
  );
}
