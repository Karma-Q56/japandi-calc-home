import { useState } from "react";
import { saveReferralSettingsFn } from "@/server/live-challenges-fns";
import type { LiveReferralInput } from "@/lib/live-challenges";
import { EmptyState, FormField } from "@/components/patron/dash";
import { Switch } from "@/components/patron/Switch";

type SimpleReward = "stamps" | "free_item";

/** Owner referral settings on the live database. Stamps or a free item for both guests. */
export function LiveReferralsTab({ settings }: { settings: LiveReferralInput | null }) {
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [rewardType, setRewardType] = useState<SimpleReward>(
    settings?.referrerRewardType === "free_item" ? "free_item" : "stamps",
  );
  const [rewardItem, setRewardItem] = useState(settings?.referrerRewardItem ?? "");
  const [limit, setLimit] = useState(settings?.limitPerMonth ?? 3);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!settings) {
    return <EmptyState title="Sign in as the owner or a manager to see referrals." />;
  }

  const save = async () => {
    const item = rewardItem.trim();
    if (enabled && rewardType === "free_item" && !item) {
      setNotice("Name the free item both guests get, or switch to bonus stamps.");
      return;
    }
    const input: LiveReferralInput = {
      enabled,
      limitPerMonth: limit,
      referrerRewardType: rewardType,
      referrerRewardItem: rewardType === "free_item" ? item : "",
      referrerPercentOff: null,
      referrerAmountOffCents: null,
      friendRewardType: rewardType,
      friendRewardItem: rewardType === "free_item" ? item : "",
      friendPercentOff: null,
      friendAmountOffCents: null,
      validDays: rewardType === "free_item" ? 30 : null,
    };
    setBusy(true);
    setNotice("");
    const result = await saveReferralSettingsFn({ data: input });
    setBusy(false);
    setNotice(result.ok ? "Bring a friend settings saved." : result.message);
  };

  return (
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
        {(
          [
            ["stamps", "A bonus stamp", "Added on top of their visit stamps."],
            ["free_item", "A free item", "Issued as a single-use code for each guest, valid 30 days."],
          ] as const
        ).map(([value, title, hint]) => (
          <label className="option-card" key={value}>
            <input
              type="radio"
              name="referral-reward"
              value={value}
              checked={rewardType === value}
              onChange={() => setRewardType(value)}
            />
            <span className="option-card-mark" aria-hidden="true" />
            <span className="option-card-body">
              <strong>{title}</strong>
              <small>{hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {rewardType === "free_item" && (
        <FormField label="The free item" hint="For example: a coffee or a slice of cake.">
          <input value={rewardItem} maxLength={120} onChange={(event) => setRewardItem(event.target.value)} />
        </FormField>
      )}
      <FormField label="Limit per guest per month" hint="Between 0 and 20 friends each month.">
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
      <button className="builder-primary" disabled={busy} onClick={save}>
        Save bring a friend settings
      </button>
    </section>
  );
}
