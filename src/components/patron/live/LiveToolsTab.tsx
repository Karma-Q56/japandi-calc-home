import { useState } from "react";
import { Helper, FormField } from "@/components/patron/dash";
import { Switch } from "@/components/patron/Switch";
import { WEEKDAYS } from "@/domain/tools";
import { budgetLine, type LiveToolsInput } from "@/lib/live-tools";
import { updateLoyaltyToolsFn } from "@/server/live-tools-fns";
import type { LiveToolsSettings } from "@/server/live-tools";

export function LiveToolsTab({ data }: { data: LiveToolsSettings }) {
  const [doubleOn, setDoubleOn] = useState(data.doubleStampEnabled);
  const [doubleDay, setDoubleDay] = useState(data.doubleStampWeekday);
  const [streakOn, setStreakOn] = useState(data.streakEnabled);
  const [streakVisits, setStreakVisits] = useState(data.streakWeeklyVisits);
  const [streakWeeks, setStreakWeeks] = useState(data.streakWeeks);
  const [streakBonus, setStreakBonus] = useState(data.streakBonusStamps);
  const [budget, setBudget] = useState(data.toolStampBudget);
  const [birthdayOn, setBirthdayOn] = useState(data.birthdayReward);
  const [birthdayKind, setBirthdayKind] = useState<"stamp" | "freeItem">(data.birthdayRewardKind);
  const [birthdayItem, setBirthdayItem] = useState(data.birthdayRewardItem);
  const [mysteryEvery, setMysteryEvery] = useState(data.mysteryEveryVisits);
  const [used, setUsed] = useState(data.toolStampsUsed);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const input: LiveToolsInput = {
      doubleStampEnabled: doubleOn,
      doubleStampWeekday: doubleDay,
      streakEnabled: streakOn,
      streakWeeks,
      streakWeeklyVisits: streakVisits,
      streakBonusStamps: streakBonus,
      toolStampBudget: budget,
      birthdayReward: birthdayOn,
      birthdayRewardKind: birthdayKind,
      birthdayRewardItem: birthdayItem,
      mysteryEveryVisits: mysteryEvery,
    };
    setBusy(true);
    const result = await updateLoyaltyToolsFn({ data: input });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setUsed(result.settings.toolStampsUsed);
    setNotice("Saved. Guests see these tools straight away.");
  };

  return (
    <>
      <section className="builder-panel" aria-label="Loyalty tools">
        <h2>Loyalty tools</h2>
        <Helper>
          Off until you switch them on. Double stamp day pulls visits onto a quieter weekday and
          streaks reward the habit of coming back. A week only counts toward a run once it meets
          the visits, so a week in progress never breaks the run or spends the budget.
        </Helper>
        <div className="builder-fields">
          <Switch
            label="Double stamp day"
            hint="One extra stamp on visits on your chosen weekday"
            checked={doubleOn}
            onChange={setDoubleOn}
          />
          {doubleOn && (
            <FormField label="Which weekday" hint="Johannesburg time. Every visit that day earns one extra stamp.">
              <select value={doubleDay} onChange={(event) => setDoubleDay(Number(event.target.value))}>
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <Switch
            label="Visit streak"
            hint="Reward coming back week after week"
            checked={streakOn}
            onChange={setStreakOn}
          />
          {streakOn && (
            <div className="builder-fields streak-fields">
              <FormField label="Visits each week to keep the run" hint="1 to 7.">
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={streakVisits}
                  onChange={(event) => setStreakVisits(Number(event.target.value))}
                />
              </FormField>
              <FormField label="Weeks in a row for the bonus" hint="2 to 12.">
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={streakWeeks}
                  onChange={(event) => setStreakWeeks(Number(event.target.value))}
                />
              </FormField>
              <FormField label="Bonus stamps at the end of the run" hint="1 to 5.">
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={streakBonus}
                  onChange={(event) => setStreakBonus(Number(event.target.value))}
                />
              </FormField>
            </div>
          )}
          <FormField
            label="Bonus stamps you can give in a month"
            hint="Double day and streak stamps together stop once this many have gone out in one month. 0 means no limit."
          >
            <input
              type="number"
              min={0}
              max={2000}
              value={budget}
              onChange={(event) => setBudget(Number(event.target.value))}
            />
          </FormField>
          <Helper>{budgetLine(budget, used)}</Helper>
          <Switch
            label="Birthday reward"
            hint="Once a year, within 3 days either side of the guest's birthday"
            checked={birthdayOn}
            onChange={setBirthdayOn}
          />
          {birthdayOn && (
            <>
              <FormField label="Birthday gift" hint="A bonus stamp, or a free item.">
                <select
                  value={birthdayKind}
                  onChange={(event) => setBirthdayKind(event.target.value as "stamp" | "freeItem")}
                >
                  <option value="stamp">One bonus stamp</option>
                  <option value="freeItem">A free item</option>
                </select>
              </FormField>
              {birthdayKind === "freeItem" && (
                <FormField label="Free item" hint="Keep it short, e.g. a slice of cake. Leave empty for a general treat.">
                  <input
                    maxLength={80}
                    value={birthdayItem}
                    onChange={(event) => setBirthdayItem(event.target.value)}
                  />
                </FormField>
              )}
            </>
          )}
          <FormField
            label="Mystery reward every how many visits?"
            hint="Every Nth visit gives one bonus stamp. 0 switches it off."
          >
            <input
              type="number"
              min={0}
              max={50}
              value={mysteryEvery}
              onChange={(event) => setMysteryEvery(Number(event.target.value))}
            />
          </FormField>
          <Helper>
            No purchase is required to earn any of these. Nothing here sends messages.
          </Helper>
        </div>
        <div className="builder-actions">
          <button className="builder-primary" type="button" disabled={busy} onClick={save}>
            Publish these loyalty tools
          </button>
        </div>
        {notice && (
          <p role="status" className="builder-hint">
            {notice}
          </p>
        )}
      </section>
    </>
  );
}
