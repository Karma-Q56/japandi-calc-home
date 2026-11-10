import { useState } from "react";
import { FormField, Helper } from "@/components/patron/dash";
import { updateLoyaltySettingsFn } from "@/server/live";
import { saveLogoFn } from "@/server/live-logo-fns";
import type { LiveLoyaltySettings } from "@/server/live-loyalty";
import type { LiveRewardKind } from "@/lib/live-loyalty";
import { rewardGiveLine, rewardGuestLine, type RewardValue } from "@/lib/reward-copy";
import { validateLogoFile } from "@/lib/logo-stamp";
import { bytesToBase64, convertLogo } from "@/lib/logo-convert";

function LogoPanel() {
  const [logoNotice, setLogoNotice] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateLogoFile(file);
    if (problem) {
      setLogoNotice(problem);
      return;
    }
    setLogoBusy(true);
    try {
      const files = await convertLogo(file);
      const result = await saveLogoFn({
        data: {
          png: bytesToBase64(files.png),
          printJpeg: bytesToBase64(files.printJpeg),
        },
      });
      setLogoNotice(result.ok ? "Logo saved. It now shows on your page and your QR code." : result.message);
    } catch {
      setLogoNotice("Could not read that image. Try a PNG or JPG file.");
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <section className="builder-panel" aria-label="Logo">
      <h2>Logo</h2>
      <Helper>PNG, JPG or SVG, up to 300 KB. Your logo shows on your page and on the QR code.</Helper>
      <FormField label="Choose a logo">
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          disabled={logoBusy}
          onChange={(event) => upload(event.target.files?.[0])}
        />
      </FormField>
      {logoNotice && (
        <p className="builder-hint" role="status">
          {logoNotice}
        </p>
      )}
    </section>
  );
}

export function LiveStampCardTab({ data }: { data: LiveLoyaltySettings }) {
  const [stampsRequired, setStampsRequired] = useState(data.stampsRequired);
  const [reward, setReward] = useState(data.rewardDescription ?? "");
  const [rewardKind, setRewardKind] = useState<LiveRewardKind>(data.rewardKind);
  const [percentOff, setPercentOff] = useState<number | null>(data.rewardPercentOff ?? 10);
  const [amountOffRand, setAmountOffRand] = useState<number | null>(
    data.rewardAmountOffCents != null ? data.rewardAmountOffCents / 100 : 20,
  );
  const [validDays, setValidDays] = useState<number | null>(data.rewardValidDays ?? null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const preview: RewardValue = {
    kind: rewardKind,
    description: reward.trim(),
    percentOff,
    amountOffCents: amountOffRand != null ? Math.round(amountOffRand * 100) : null,
  };

  const save = async () => {
    setBusy(true);
    const result = await updateLoyaltySettingsFn({
      data: {
        stampsRequired,
        rewardDescription: reward,
        rewardKind,
        rewardPercentOff: rewardKind === "percent_off" ? percentOff : null,
        rewardAmountOffCents:
          rewardKind === "amount_off" && amountOffRand != null
            ? Math.round(amountOffRand * 100)
            : null,
        rewardValidDays: validDays,
        visitWindowMinutes: data.visitWindowMinutes,
        welcomeStamp: data.welcomeStamp,
        marketingWeeklyCap: data.marketingWeeklyCap,
        memberWeeklyCap: data.memberWeeklyCap,
      },
    });
    setBusy(false);
    setNotice(result.ok ? "Saved. The live card uses these rules now." : result.message);
  };

  return (
    <>
    <LogoPanel />
    <section className="builder-panel" aria-label="Stamp card rules">
      <h2>Reward</h2>
      <div className="builder-fields">
        <FormField label="Stamps needed" hint="Whole number from 2 to 30.">
          <input
            type="number"
            min={2}
            max={30}
            value={stampsRequired}
            onChange={(event) => setStampsRequired(Number(event.target.value))}
          />
        </FormField>
        <FormField label="What the guest gets" hint="Pick the kind of reward.">
          <select
            value={rewardKind}
            onChange={(event) => setRewardKind(event.target.value as LiveRewardKind)}
          >
            <option value="free_item">Free item</option>
            <option value="percent_off">Percent off the bill</option>
            <option value="amount_off">Rand amount off the bill</option>
          </select>
        </FormField>
        {rewardKind === "free_item" && (
          <FormField label="Free item" hint="Keep it short and plain, e.g. a flat white.">
            <input maxLength={120} value={reward} onChange={(event) => setReward(event.target.value)} />
          </FormField>
        )}
        {rewardKind === "percent_off" && (
          <FormField label="Percent off" hint="Whole number from 1 to 100.">
            <input
              type="number"
              min={1}
              max={100}
              value={percentOff ?? ""}
              onChange={(event) =>
                setPercentOff(event.target.value === "" ? null : Number(event.target.value))
              }
            />
          </FormField>
        )}
        {rewardKind === "amount_off" && (
          <FormField label="Rand off" hint="Above zero, e.g. 20 for R20 off.">
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={amountOffRand ?? ""}
              onChange={(event) =>
                setAmountOffRand(event.target.value === "" ? null : Number(event.target.value))
              }
            />
          </FormField>
        )}
        <FormField label="Valid for days" hint="Leave empty for no expiry. 1 to 365 days.">
          <input
            type="number"
            min={1}
            max={365}
            value={validDays ?? ""}
            onChange={(event) =>
              setValidDays(event.target.value === "" ? null : Number(event.target.value))
            }
          />
        </FormField>
      </div>
      <Helper>
        Guests see: {rewardGuestLine(preview)}.{" "}
        {validDays ? "They also see a use-by date. " : ""}Staff see: {rewardGiveLine(preview)}.
      </Helper>
      <button className="builder-primary" type="button" disabled={busy} onClick={save}>
        Save rules
      </button>
      {notice && (
        <p className="builder-hint" role="status">
          {notice}
        </p>
      )}
    </section>
    </>
  );
}
