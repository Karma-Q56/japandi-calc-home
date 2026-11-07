import { useState } from "react";
import { Helper, FormField } from "@/components/patron/dash";
import { validateTiers, type LiveTiersInput } from "@/lib/live-tools";
import { updateGuestTiersFn } from "@/server/live-tools-fns";
import type { LiveTiers } from "@/server/live-tools";

export function LiveTiersTab({ data }: { data: LiveTiers }) {
  const [regular, setRegular] = useState(data.regular);
  const [vip, setVip] = useState(data.vip);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const input: LiveTiersInput = { regular, vip };
    const check = validateTiers(input);
    if (!check.ok) {
      setNotice(check.message);
      return;
    }
    setBusy(true);
    const result = await updateGuestTiersFn({ data: input });
    setBusy(false);
    setNotice(result.ok ? "Saved. Guests see their new tier from their next visit." : result.message);
  };

  return (
    <section className="builder-panel" aria-label="Guest tiers">
      <h2>Guest tiers</h2>
      <Helper>
        Tiers count the visits a guest makes in the last 90 days. A guest moves up as soon as they
        reach the number of visits for the tier.
      </Helper>
      <div className="builder-fields">
        <FormField label="Regular after how many visits" hint="1 to 100 visits in 90 days.">
          <input
            type="number"
            min={1}
            max={100}
            value={regular}
            onChange={(event) => setRegular(Number(event.target.value))}
          />
        </FormField>
        <FormField label="VIP after how many visits" hint="Must be more than Regular. Up to 200.">
          <input
            type="number"
            min={2}
            max={200}
            value={vip}
            onChange={(event) => setVip(Number(event.target.value))}
          />
        </FormField>
      </div>
      <Helper>
        New face: under {regular} visits. Regular: {regular} to {vip - 1} visits. VIP: {vip} visits
        or more.
      </Helper>
      <div className="builder-actions">
        <button className="builder-primary" type="button" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Publish these tiers"}
        </button>
      </div>
      {notice && (
        <p role="status" className="builder-hint">
          {notice}
        </p>
      )}
    </section>
  );
}
