import { plainDate, type BillingBannerKind } from "@/lib/live-billing";

// A line shown on every owner screen when the monthly card payment needs attention (D25).

export function BillingBanner({
  kind,
  graceEndsAt,
}: {
  kind: Exclude<BillingBannerKind, "none">;
  graceEndsAt: string | null;
}) {
  const text =
    kind === "paused"
      ? "Your campaigns are paused because a monthly payment did not go through. Your till and loyalty card keep working."
      : graceEndsAt
        ? `A monthly payment did not go through. Fix it by ${plainDate(graceEndsAt)} or your campaigns will pause.`
        : "A monthly payment did not go through. Fix it soon or your campaigns will pause.";
  return (
    <div className="builder-panel" role="status">
      <p>
        {text} <a href="/app/billing">Plan and billing</a>
      </p>
    </div>
  );
}
