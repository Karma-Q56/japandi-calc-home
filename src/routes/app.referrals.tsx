import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { useDemoState } from "@/data/useDemoState";
import {
  Badge,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  PageHeader,
  PreviewBanner,
  StatCard,
  StatGrid,
} from "@/components/patron/dash";
import { Switch } from "@/components/patron/Switch";
import { referralGuestPreview } from "@/domain/referrals";

import type { ReferralConfig } from "@/data/types";
import type { ReferralOverview } from "@/domain/referrals";

export const Route = createFileRoute("/app/referrals")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: ReferralsPage,
});

const STEP_LABELS = ["Draft", "Preview", "Publish"] as const;

function ReferralsPage() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const restaurantId = restaurant.id;

  const overviewResult = api.referral.overview({ restaurantId, session: state.session });
  if (!overviewResult.ok) {
    return (
      <main className="demo-hub page-width">
        <h1>Bring a friend.</h1>
        <p className="demo-intro">{overviewResult.error.message}</p>
      </main>
    );
  }
  const overview = overviewResult.data;

  return <ReferralsBody restaurant={{ id: restaurant.id, name: restaurant.name }} data={overview} />;
}

function ReferralsBody({
  restaurant,
  data: overview,
}: {
  restaurant: { id: string; name: string };
  data: ReferralOverview;
}) {
  const state = useDemoState();
  const initialState = overview.config;
  const [step, setStep] = useState(1);
  const [enabled, setEnabled] = useState(initialState.enabled);
  const [rewardKind, setRewardKind] = useState(initialState.rewardKind);
  const [rewardItem, setRewardItem] = useState(initialState.rewardItem);
  const [limit, setLimit] = useState(initialState.limitPerMemberPerMonth);
  const [notice, setNotice] = useState("");
  const [published, setPublished] = useState(false);

  const config: ReferralConfig = {
    enabled,
    rewardKind,
    rewardItem,
    limitPerMemberPerMonth: limit,
  };
  const preview = referralGuestPreview({ restaurant, config });

  const canContinue = () => {
    if (enabled && rewardKind === "freeItem" && !rewardItem.trim()) {
      setNotice("Choose the free item both guests get, or switch to bonus stamps.");
      return false;
    }
    return true;
  };

  const publish = () => {
    const saved = api.referral.saveSettings({
      restaurantId: restaurant.id,
      session: state.session,
      enabled,
      rewardKind,
      rewardItem,
      limitPerMemberPerMonth: limit,
    });
    if (!saved.ok) {
      setNotice(saved.error.message);
      return;
    }
    setNotice("Bring a friend settings saved.");
    setPublished(true);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`${restaurant.name} · Bring a friend`}
        title="Let your happy guests bring friends."
        intro="Every guest gets a personal link. When their friend gets their first stamp, both guests earn the reward you choose."
      />
      <ol className="cmp-steps" aria-label={`Step ${step} of 3`}>
        {STEP_LABELS.map((label, index) => (
          <li
            key={label}
            className={index + 1 === step ? "is-now" : index + 1 < step ? "is-done" : ""}
          >
            <i>{index + 1 < step ? "✓" : index + 1}</i>
            {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="cmp-card">
          <h2>How your bring a friend offer works</h2>
          <Switch
            checked={enabled}
            onChange={setEnabled}
            label="Bring a friend is on"
            hint="Off means no guest sees a share link anywhere."
          />
          <fieldset className="option-cards" disabled={!enabled}>
            <legend>What both guests get after the friend's first stamp</legend>
            {([
              ["stamp", "A bonus stamp", "Added on top of their visit stamps."],
              ["freeItem", "A free item", "Issued as a single-use code for each guest."],
            ] as const).map(([value, title, hint]) => (
              <label className="option-card" key={value}>
                <input
                  type="radio"
                  name="referral-reward"
                  value={value}
                  checked={rewardKind === value}
                  onChange={() => setRewardKind(value)}
                />
                <span className="option-card-mark" aria-hidden="true" />
                <span className="option-card-body">
                  <strong>{title}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {rewardKind === "freeItem" && (
            <FormField
              label="The free item"
              hint="Pick something from your menu. The cost estimate uses its price."
            >
              <select value={rewardItem} onChange={(event) => setRewardItem(event.target.value)}>
                <option value="">Choose an item…</option>
                {overview.menuItemNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField
            label="Limit per guest per month"
            hint="How many friends one guest can bring a friend for each month. Keeps the cost steady."
          >
            <input
              type="number"
              min={0}
              max={20}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            />
          </FormField>
          {notice && (
            <p className="cmp-warn" role="status">
              {notice}
            </p>
          )}
          <button
            className="builder-primary"
            onClick={() => {
              setNotice("");
              if (canContinue()) setStep(2);
            }}
          >
            Continue
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="cmp-card">
          <button className="cmp-back" onClick={() => setStep(1)}>
            ← Back
          </button>
          <h2>Preview: what your guests see</h2>
          <div className="cmp-phone">
            <small>The guest who shares</small>
            <p>{preview.referrerText}</p>
            <small>The friend who joins</small>
            <p>{preview.friendText}</p>
          </div>
          <p className="cmp-note">{overview.estimateText}</p>
          <p className="cmp-note">
            {config.rewardKind === "stamp"
              ? "No SMS cost. The reward lands on the card automatically."
              : "Both guests get their own single-use code, valid for 30 days."}
          </p>
          <PreviewBanner>Preview only. Nothing changes until you publish on the next step.</PreviewBanner>
          <button className="builder-primary" onClick={() => setStep(3)}>
            Continue
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="cmp-card">
          <button className="cmp-back" onClick={() => setStep(2)}>
            ← Back
          </button>
          <h2>Ready to go live?</h2>
          <p className="cmp-note">
            Bring a friend will be {enabled ? "on" : "off"} with{" "}
            {rewardKind === "stamp" ? "a bonus stamp" : `a free ${rewardItem.toLowerCase() || "item"}`}{" "}
            for both guests, {limit} referral{limit === 1 ? "" : "s"} per guest per month.
          </p>
          <div className="page-actions">
            <ConfirmDialog
              label={enabled ? "Publish changes" : "Save with bring a friend off"}
              question={
                enabled
                  ? "Publish these bring a friend settings? Guests will see share links on their cards."
                  : "Save settings with bring a friend off? No guest will see a share link."
              }
              confirmLabel="Yes, publish"
              buttonClass="builder-primary"
              onConfirm={publish}
            />
          </div>
          {notice && (
            <p className="cmp-warn" role="status">
              {notice}
            </p>
          )}
          {published && (
            <p className="gx-note" role="status">
              Published. Share links now show on cards while bring a friend is on.
            </p>
          )}
        </section>
      )}

      <StatGrid>
        <StatCard value={overview.rewardedThisMonth} label="Pairs rewarded this month" />
        <StatCard
          value={overview.config.limitPerMemberPerMonth}
          label="Limit per guest each month"
          hint="One guest can bring a friend for this many friends."
        />
      </StatGrid>

      <section className="gx-panel">
        <h2>Recent referrals</h2>
        {overview.referrals.length === 0 ? (
          <EmptyState
            title="No referrals yet"
            hint="Rows appear here the moment a guest joins through a friend's link."
          />
        ) : (
          <DataTable
            caption="Bring a friend referrals"
            columns={[
              { key: "pair", header: "Pair", cell: (row: { referrerName: string; friendName: string }) => `${row.referrerName} and ${row.friendName}` },
              {
                key: "status",
                header: "Status",
                cell: (row: { status: string; rejectReason?: string }) =>
                  row.status === "rewarded" ? (
                    <Badge tone="sent">Rewarded</Badge>
                  ) : row.status === "pending" ? (
                    <Badge tone="active">Waiting for the friend's first stamp</Badge>
                  ) : (
                    <Badge>{row.rejectReason ?? "Rejected"}</Badge>
                  ),
              },
              {
                key: "when",
                header: "Joined",
                cell: (row: { createdAt: string }) =>
                  new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(
                    new Date(row.createdAt),
                  ),
              },
            ]}
            rows={overview.referrals}
          />
        )}
      </section>
    </main>
  );
}
