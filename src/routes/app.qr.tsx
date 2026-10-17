import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { QrPrintPack } from "@/components/patron/QrPrintPack";
export const Route = createFileRoute("/app/qr")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/demo" });
  },
  component: QrOwner,
});
function QrOwner() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        QR print pack
      </p>
      <h1>{restaurant.name}.</h1>
      <QrPrintPack restaurant={restaurant} />
    </main>
  );
}
