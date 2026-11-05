import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { StampSlots } from "@/components/patron/StampSlots";
import { Switch } from "@/components/patron/Switch";
import { ConfirmDialog, FormField, Helper, PageHeader } from "@/components/patron/dash";
import {
  PhoneFrame,
  PreviewOnly,
  PublishSteps,
  WheelPreview,
} from "@/components/patron/preview";
import { MAX_SPIN_PRIZES, SPIN_MODES } from "@/domain/spins";
import { oddsInWords, weightWarning } from "@/lib/wheel";
import { MISS_YOU_COOLDOWN_DAYS, MISS_YOU_MAX_AFTER_DAYS, MISS_YOU_MIN_AFTER_DAYS } from "@/domain/presets";
import { WEEKDAYS } from "@/domain/tools";
import type { SpinConfig, SpinMode, SpinSegment } from "@/data/types";
import { useDemoState } from "@/data/useDemoState";
import {
  getDataModeFn,
  getLoyaltySettingsFn,
  updateLoyaltySettingsFn,
} from "@/server/live";
import type { LiveLoyaltySettings } from "@/server/live-loyalty";

export const Route = createFileRoute("/app/loyalty")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await getLoyaltySettingsFn() };
  },
  component: Loyalty,
});

const TABS: ReadonlyArray<{ id: string; label: string; href?: string }> = [
  { id: "rewards", label: "Stamp card" },
  { id: "tools", label: "Rewards" },
  { id: "challenges", label: "Challenges", href: "/app/challenges" },
  { id: "referrals", label: "Referrals", href: "/app/referrals" },
  { id: "tiers", label: "Tiers" },
  { id: "wheel", label: "Spin" },
];

type Tab = "rewards" | "tools" | "tiers" | "wheel";

function blankSegment(): SpinSegment {
  return {
    id: `segment-${crypto.randomUUID()}`,
    label: "",
    weight: 10,
    valueCents: 0,
  };
}

function Loyalty() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveLoyalty data={data.live} />;
  return <DemoLoyalty />;
}

function DemoLoyalty() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [stampsRequired, setStampsRequired] = useState(restaurant.stampsRequired);
  const [reward, setReward] = useState(restaurant.rewardDescription);
  const [windowMinutes, setWindowMinutes] = useState(restaurant.visitWindowMinutes);
  const [welcomeStamps, setWelcomeStamps] = useState(restaurant.welcomeStamps);
  const [regular, setRegular] = useState(restaurant.tiers.regular);
  const [vip, setVip] = useState(restaurant.tiers.vip);
  const [mysteryOn, setMysteryOn] = useState(restaurant.mysteryEveryVisits > 0);
  const [mystery, setMystery] = useState(
    restaurant.mysteryEveryVisits > 0 ? restaurant.mysteryEveryVisits : 5,
  );
  const [birthday, setBirthday] = useState(restaurant.birthdayReward);
  const [birthdayKind, setBirthdayKind] = useState<"stamp" | "freeItem">(
    restaurant.birthdayRewardKind ?? "stamp",
  );
  const [birthdayItem, setBirthdayItem] = useState(restaurant.birthdayRewardItem ?? "");
  // New in the preset section: the miss-you rule and the hand-out reward.
  const [missYouOn, setMissYouOn] = useState(restaurant.missYou?.enabled ?? false);
  const [missYouDays, setMissYouDays] = useState(restaurant.missYou?.afterDays ?? 30);
  const [missYouKind, setMissYouKind] = useState<"stamp" | "freeItem">(
    restaurant.missYou?.kind ?? "stamp",
  );
  const [missYouItem, setMissYouItem] = useState(restaurant.missYou?.item ?? "");
  const [missYouRunLine, setMissYouRunLine] = useState("");
  const [customOn, setCustomOn] = useState(restaurant.customReward?.enabled ?? false);
  const [customName, setCustomName] = useState(restaurant.customReward?.name ?? "");
  const [customLimit, setCustomLimit] = useState(restaurant.customReward?.limitPerGuestPerMonth ?? 1);
  // Loyalty tools: double stamp day, visit streak and the shared budget cap.
  const [doubleOn, setDoubleOn] = useState(restaurant.doubleStamp?.enabled ?? false);
  const [doubleDay, setDoubleDay] = useState(restaurant.doubleStamp?.weekday ?? 2);
  const [streakOn, setStreakOn] = useState(restaurant.streak?.enabled ?? false);
  const [streakWeeks, setStreakWeeks] = useState(restaurant.streak?.weeks ?? 3);
  const [streakVisits, setStreakVisits] = useState(restaurant.streak?.weeklyVisits ?? 2);
  const [streakBonus, setStreakBonus] = useState(restaurant.streak?.bonusStamps ?? 1);
  const [budget, setBudget] = useState(restaurant.toolStampBudget ?? 100);
  const birthdayPreview = birthday ? api.loyalty.birthdayPreview(restaurant.id) : null;
  const presetCosts = api.loyalty.presetCosts(restaurant.id);
  const costNote = (id: string) =>
    presetCosts.find((preset) => preset.id === id)?.note ?? "";
  const previewRules = api.loyalty.whatHappensWhen({
    ...restaurant,
    stampsRequired,
    rewardDescription: reward.trim() || restaurant.rewardDescription,
    welcomeStamps,
    mysteryEveryVisits: mysteryOn ? mystery : 0,
    birthdayReward: birthday,
    birthdayRewardKind: birthdayKind,
    birthdayRewardItem: birthdayKind === "freeItem" ? birthdayItem.trim() : "",
    missYou: {
      enabled: missYouOn,
      afterDays: missYouDays,
      kind: missYouKind,
      item: missYouKind === "freeItem" ? missYouItem.trim() : "",
    },
    customReward: {
      enabled: customOn,
      name: customName.trim(),
      limitPerGuestPerMonth: customLimit,
    },
  });
  const [spin, setSpin] = useState<SpinConfig>(restaurant.spin);
  const [tab, setTab] = useState<Tab>("rewards");
  const [steps, setSteps] = useState<Record<Tab, number>>({
    rewards: 1,
    tools: 1,
    wheel: 1,
    tiers: 1,
  });
  const [published, setPublished] = useState<Record<Tab, boolean>>({
    rewards: false,
    tools: false,
    wheel: false,
    tiers: false,
  });
  const [notice, setNotice] = useState("");
  const step = steps[tab];
  const setStep = (next: number) => setSteps((current) => ({ ...current, [tab]: next }));

  const saveRules = (): boolean => {
    if (stampsRequired < 2 || stampsRequired > 30) {
      setNotice("Pick 2 to 30 stamps for a full card.");
      return false;
    }
    if (reward.trim().length < 1 || reward.trim().length > 80) {
      setNotice("Add the reward in a few words, up to 80 letters.");
      return false;
    }
    if (
      birthday &&
      birthdayKind === "freeItem" &&
      (birthdayItem.trim().length < 2 || birthdayItem.trim().length > 60)
    ) {
      setNotice("Name the free birthday item in 2 to 60 letters, or pick a bonus stamp.");
      return false;
    }
    if (welcomeStamps < 0 || welcomeStamps > stampsRequired - 1) {
      setNotice(`Stamps to start with must be 0 to ${stampsRequired - 1}.`);
      return false;
    }
    if (mysteryOn && (!Number.isInteger(mystery) || mystery < 2 || mystery > 50)) {
      setNotice("The bonus stamp visit number must be 2 to 50.");
      return false;
    }
    if (missYouOn) {
      if (!Number.isInteger(missYouDays) || missYouDays < MISS_YOU_MIN_AFTER_DAYS || missYouDays > MISS_YOU_MAX_AFTER_DAYS) {
        setNotice(`Miss-you days must be ${MISS_YOU_MIN_AFTER_DAYS} to ${MISS_YOU_MAX_AFTER_DAYS}.`);
        return false;
      }
      if (
        missYouKind === "freeItem" &&
        (missYouItem.trim().length < 2 || missYouItem.trim().length > 60)
      ) {
        setNotice("Name the free miss-you item in 2 to 60 letters, or pick a bonus stamp.");
        return false;
      }
    }
    if (customOn) {
      if (customName.trim().length < 2 || customName.trim().length > 60) {
        setNotice("Give the hand-out reward a name of 2 to 60 letters.");
        return false;
      }
      if (!Number.isInteger(customLimit) || customLimit < 1 || customLimit > 20) {
        setNotice("The hand-out limit must be 1 to 20 per guest each month.");
        return false;
      }
    }
    const result = api.restaurant.update(restaurant.id, {
      stampsRequired,
      rewardDescription: reward.trim(),
      visitWindowMinutes: windowMinutes,
      welcomeStamps,
      welcomeStamp: welcomeStamps > 0,
      mysteryEveryVisits: mysteryOn ? mystery : 0,
      birthdayReward: birthday,
      birthdayRewardKind: birthdayKind,
      birthdayRewardItem: birthdayKind === "freeItem" ? birthdayItem.trim() : "",
      missYou: {
        enabled: missYouOn,
        afterDays: missYouDays,
        kind: missYouKind,
        item: missYouKind === "freeItem" ? missYouItem.trim() : "",
      },
      customReward: {
        enabled: customOn,
        name: customName.trim(),
        limitPerGuestPerMonth: customLimit,
      },
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return false;
    }
    setNotice("Card rules saved.");
    return true;
  };

  const saveTiers = (): boolean => {
    if (regular < 1 || vip <= regular) {
      setNotice("The VIP visits must be higher than the Regular visits.");
      return false;
    }
    const result = api.restaurant.update(restaurant.id, { tiers: { regular, vip } });
    if (!result.ok) {
      setNotice(result.error.message);
      return false;
    }
    setNotice("Tiers saved.");
    return true;
  };

  const saveTools = (): boolean => {
    const toolsResult = api.loyalty.saveTools({
      restaurantId: restaurant.id,
      doubleStamp: { enabled: doubleOn, weekday: doubleDay },
      streak: {
        enabled: streakOn,
        weeks: streakWeeks,
        weeklyVisits: streakVisits,
        bonusStamps: streakBonus,
      },
      toolStampBudget: budget,
    });
    if (!toolsResult.ok) {
      setNotice(toolsResult.error.message);
      return false;
    }
    setNotice("Loyalty tools saved.");
    return true;
  };

  const runMissYou = () => {
    if (!missYouOn) {
      setMissYouRunLine("Switch the rule on and save first.");
      return;
    }
    const saved = saveRules();
    if (!saved) return;
    const result = api.loyalty.runMissYou(restaurant.id);
    const good = result.treated === 1 ? "guest was treated" : "guests were treated";
    const stampWord = result.stamps === 1 ? "stamp" : "stamps";
    const budgetWord =
      result.skippedBudget === 1
        ? "1 guest"
        : result.skippedBudget === 0
          ? ""
          : `${result.skippedBudget} guests`;
    setMissYouRunLine(
      result.treated === 0
        ? budgetWord
          ? `${budgetWord} missed out because the monthly bonus budget is full.`
          : "No guest qualifies right now."
        : `${result.treated} ${good} (${result.stamps} bonus ${stampWord} given)${
            budgetWord ? `, and ${budgetWord} skipped for the budget` : ""
          }.`,
    );
  };

  const saveSpin = (): boolean => {
    const result = api.spin.saveConfig({ restaurantId: restaurant.id, config: spin });
    setNotice(result.ok ? "Spin wheel saved." : result.error.message);
    return result.ok;
  };

  const setSegment = (id: string, patch: Partial<SpinSegment>) => {
    setSpin((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === id ? { ...segment, ...patch } : segment,
      ),
    }));
  };

  const publishBar = (question: string, save: () => boolean) => (
    <div className="page-actions">
      {step === 1 && (
        <button className="builder-primary" onClick={() => setStep(2)}>
          Preview changes
        </button>
      )}
      {step === 2 && (
        <>
          <ConfirmDialog
            label="Publish this tab"
            question={question}
            confirmLabel="Yes, publish"
            buttonClass="builder-primary"
            onConfirm={() => {
              if (!save()) return;
              setPublished((current) => ({ ...current, [tab]: true }));
              setStep(3);
            }}
          />
          <button className="builder-secondary" onClick={() => setStep(1)}>
            Back to editing
          </button>
        </>
      )}
      {step === 3 && (
        <>
          <p role="status" className="builder-hint">
            Published. Guests see this now. Any further change needs Preview and Publish again.
          </p>
          <button className="builder-secondary" onClick={() => setStep(1)}>
            Edit again
          </button>
        </>
      )}
    </div>
  );

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Loyalty · ${restaurant.name}`}
        title="The card rules"
        intro="Changing rules never alters rewards already earned. Stamps above a lowered threshold convert on the next stamp."
      />
      <nav className="loyalty-tabs" aria-label="Loyalty sections">
        {TABS.map((item) => (
          "href" in item ? (
            <a key={item.id} className="loyalty-tab" href={item.href}>
              {item.label}
            </a>
          ) : (
            <button
              key={item.id}
              type="button"
              className={`loyalty-tab${tab === item.id ? " is-active" : ""}`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id as Tab)}
            >
              {item.label}
            </button>
          )
        ))}
      </nav>
      <PublishSteps step={step} labels={["Draft", "Preview", "Publish"]} />

      {tab === "rewards" && (
        <section className="builder-panel" aria-label="Rewards">
          <h2>When do guests get a reward?</h2>
          <div className="what-happens-when">
            <h3>What happens when</h3>
            {previewRules.length > 0 ? (
              <ul>
                {previewRules.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <Helper>No rule is switched on yet.</Helper>
            )}
          </div>

          <details className="preset-rule" open>
            <summary>Collect stamps</summary>
            <Helper>{costNote("collect")}</Helper>
            <div className="builder-fields">
              <label className="builder-field">
                How many stamps fill the card?
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={stampsRequired}
                  onChange={(event) => setStampsRequired(Number(event.target.value))}
                />
                <Helper>Pick 2 to 30.</Helper>
              </label>
              <label className="builder-field">
                What do they get?
                <input
                  value={reward}
                  maxLength={80}
                  placeholder="a free coffee"
                  onChange={(event) => setReward(event.target.value)}
                />
                <Helper>Keep it short. For example: a free coffee.</Helper>
              </label>
              <label className="builder-field">
                Minutes allowed between stamps
                <input
                  type="number"
                  min={30}
                  value={windowMinutes}
                  onChange={(event) => setWindowMinutes(Number(event.target.value))}
                />
                <Helper>Stamps on the same visit count only inside this window.</Helper>
              </label>
            </div>
            <div className="live-preview">
              <StampSlots
                filled={Math.min(welcomeStamps, stampsRequired - 1)}
                total={stampsRequired}
                theme={restaurant.theme}
              />
              <p>
                {stampsRequired} stamps to {reward || "your reward"}
                {welcomeStamps > 0 ? ` · they start with ${welcomeStamps}` : ""}
              </p>
            </div>
          </details>

          <details className="preset-rule">
            <summary>Every so many visits</summary>
            <Helper>{costNote("every-nth")}</Helper>
            <div className="builder-fields">
              <Switch
                label="Bonus stamp every so often"
                hint="A bonus stamp after a set number of visits"
                checked={mysteryOn}
                onChange={setMysteryOn}
              />
              {mysteryOn && (
                <label className="builder-field">
                  Give a bonus stamp every how many visits?
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={mystery}
                    onChange={(event) => setMystery(Number(event.target.value))}
                  />
                  <Helper>Pick 2 to 50.</Helper>
                </label>
              )}
            </div>
          </details>

          <details className="preset-rule">
            <summary>When they join</summary>
            <Helper>{costNote("join")}</Helper>
            <div className="builder-fields">
              <label className="builder-field">
                Stamps to start with
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, stampsRequired - 1)}
                  value={welcomeStamps}
                  onChange={(event) => setWelcomeStamps(Number(event.target.value))}
                />
                <Helper>
                  From 0 up to {Math.max(0, stampsRequired - 1)}. The join screen shows "You start
                  with {welcomeStamps} stamp{welcomeStamps === 1 ? "" : "s"}."
                </Helper>
              </label>
            </div>
          </details>

          <details className="preset-rule">
            <summary>Birthday week</summary>
            <Helper>{costNote("birthday")}</Helper>
            <div className="builder-fields">
              <Switch
                label="Birthday treat"
                hint="Once a year, in the birthday week"
                checked={birthday}
                onChange={setBirthday}
              />
              {birthday && (
                <>
                  <label className="builder-field">
                    What birthday guests get
                    <select
                      value={birthdayKind}
                      onChange={(event) =>
                        setBirthdayKind(event.target.value as "stamp" | "freeItem")
                      }
                    >
                      <option value="stamp">A bonus stamp on their card</option>
                      <option value="freeItem">A free item at the till</option>
                    </select>
                  </label>
                  {birthdayKind === "freeItem" && (
                    <label className="builder-field">
                      Name the free item
                      <input
                        value={birthdayItem}
                        maxLength={60}
                        placeholder="birthday cupcake"
                        onChange={(event) => setBirthdayItem(event.target.value)}
                      />
                      <Helper>2 to 60 letters, for example birthday cupcake.</Helper>
                    </label>
                  )}
                  <div className="birthday-preview" aria-live="polite">
                    <span className="eyebrow">Preview</span>
                    {birthdayPreview && (
                      <>
                        <p className="birthday-preview-line">Guest sees: {birthdayPreview.guestLine}</p>
                        <p className="birthday-preview-line">Till sees: {birthdayPreview.tillLine}</p>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </details>

          <details className="preset-rule">
            <summary>We miss you</summary>
            <Helper>{costNote("miss-you")}</Helper>
            <div className="builder-fields">
              <Switch
                label="We miss you treat"
                hint={`Someone who has not visited for a while gets a treat, once every ${MISS_YOU_COOLDOWN_DAYS} days`}
                checked={missYouOn}
                onChange={setMissYouOn}
              />
              {missYouOn && (
                <>
                  <label className="builder-field">
                    Days without a visit ({MISS_YOU_MIN_AFTER_DAYS} to {MISS_YOU_MAX_AFTER_DAYS})
                    <input
                      type="number"
                      min={MISS_YOU_MIN_AFTER_DAYS}
                      max={MISS_YOU_MAX_AFTER_DAYS}
                      value={missYouDays}
                      onChange={(event) => setMissYouDays(Number(event.target.value))}
                    />
                    <Helper>
                      Default 30. Anyone away longer than this qualifies, and nobody is treated
                      twice inside {MISS_YOU_COOLDOWN_DAYS} days.
                    </Helper>
                  </label>
                  <label className="builder-field">
                    What the guest gets
                    <select
                      value={missYouKind}
                      onChange={(event) =>
                        setMissYouKind(event.target.value as "stamp" | "freeItem")
                      }
                    >
                      <option value="stamp">A bonus stamp on their card</option>
                      <option value="freeItem">A single-use personal offer</option>
                    </select>
                  </label>
                  {missYouKind === "freeItem" && (
                    <label className="builder-field">
                      Name the free item
                      <input
                        value={missYouItem}
                        maxLength={60}
                        placeholder="a small chips"
                        onChange={(event) => setMissYouItem(event.target.value)}
                      />
                      <Helper>2 to 60 letters, for example a small chips.</Helper>
                    </label>
                  )}
                  <div className="page-actions">
                    <button type="button" className="builder-secondary" onClick={runMissYou}>
                      Try the rule now
                    </button>
                  </div>
                  <Helper>
                    {missYouRunLine ||
                      "Practice run for today. Nothing is sent by itself; in live mode this runs once a day."}
                  </Helper>
                  <PhoneFrame label="Guest miss-you preview">
                    <strong>{restaurant.name}</strong>
                    {missYouKind === "freeItem" && missYouItem.trim() ? (
                      <p>{missYouItem.trim()} on the house. Show this code at the till.</p>
                    ) : (
                      <p>
                        Long time no visit. Here is a bonus stamp to say come back when you feel
                        like it.
                      </p>
                    )}
                    <small>
                      Arrives on their card the next time they open it. Once every{" "}
                      {MISS_YOU_COOLDOWN_DAYS} days at most.
                    </small>
                  </PhoneFrame>
                </>
              )}
            </div>
          </details>

          <details className="preset-rule">
            <summary>Quiet day bonus</summary>
            <Helper>{costNote("quiet-day")}</Helper>
            <Helper>
              This uses the double stamp day you switch on under Loyalty tools. There is no second
              form here.
            </Helper>
          </details>

          <details className="preset-rule">
            <summary>Hand-out reward</summary>
            <Helper>{costNote("custom")}</Helper>
            <div className="builder-fields">
              <Switch
                label="Hand-out reward"
                hint="A reward you give by hand at the till; the guest gets a single-use offer"
                checked={customOn}
                onChange={setCustomOn}
              />
              {customOn && (
                <>
                  <label className="builder-field">
                    Name the reward
                    <input
                      value={customName}
                      maxLength={60}
                      placeholder="a cookie at 20 visits"
                      onChange={(event) => setCustomName(event.target.value)}
                    />
                    <Helper>2 to 60 letters, for example a cookie at 20 visits.</Helper>
                  </label>
                  <label className="builder-field">
                    How many can one guest get in a month?
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={customLimit}
                      onChange={(event) => setCustomLimit(Number(event.target.value))}
                    />
                    <Helper>
                      Pick 1 to 20. You hand it out on the guest page, and the single-use offer
                      appears on their card at once.
                    </Helper>
                  </label>
                </>
              )}
            </div>
          </details>

          {step >= 2 && (
            <section className="builder-panel" aria-label="Rewards preview">
              <h3>What guests see</h3>
              <PreviewOnly>Preview only. Guests still see the old rules until you publish.</PreviewOnly>
              <PhoneFrame label="Guest loyalty card">
                <strong>{restaurant.name}</strong>
                <small>{reward || "your reward"}</small>
                <StampSlots
                  filled={Math.min(welcomeStamps, Math.max(1, stampsRequired - 1))}
                  total={stampsRequired}
                  theme={restaurant.theme}
                />
                <p>
                  {stampsRequired} stamps to {reward || "your reward"}
                </p>
                <p>
                  {welcomeStamps > 0
                    ? `You start with ${welcomeStamps} ${welcomeStamps === 1 ? "stamp" : "stamps"}.`
                    : "Start collecting from your first visit."}
                </p>
                {previewRules.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </PhoneFrame>
            </section>
          )}

          {publishBar(
            "Publish these card rules? Guests see the new card straight away.",
            saveRules,
          )}
        </section>
      )}

      {tab === "tools" && (
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
              <>
                <label className="builder-field">
                  Which weekday
                  <select
                    value={doubleDay}
                    onChange={(event) => setDoubleDay(Number(event.target.value))}
                  >
                    {WEEKDAYS.map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <Helper>
                  Every visit on that Johannesburg weekday earns one extra stamp, not only the
                  first. It never stacks with another double.
                </Helper>
              </>
            )}
            <Switch
              label="Visit streak"
              hint="Reward coming back week after week"
              checked={streakOn}
              onChange={setStreakOn}
            />
            {streakOn && (
              <div className="builder-fields streak-fields">
                <label className="builder-field">
                  Visits each week to keep the run
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={streakVisits}
                    onChange={(event) => setStreakVisits(Number(event.target.value))}
                  />
                </label>
                <label className="builder-field">
                  Weeks in a row for the bonus
                  <input
                    type="number"
                    min={2}
                    max={12}
                    value={streakWeeks}
                    onChange={(event) => setStreakWeeks(Number(event.target.value))}
                  />
                </label>
                <label className="builder-field">
                  Bonus stamps at the end of the run
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={streakBonus}
                    onChange={(event) => setStreakBonus(Number(event.target.value))}
                  />
                </label>
              </div>
            )}
            {(doubleOn || streakOn || missYouOn) && (
              <label className="builder-field">
                Bonus stamps you can give in a month
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={budget}
                  onChange={(event) => setBudget(Number(event.target.value))}
                />
                <Helper>
                  Double day, streak and miss-you stamps together stop once this many bonus stamps
                  have gone out in one month. Used so far: {api.loyalty.toolBudget(restaurant.id).used}.
                </Helper>
              </label>
            )}
            <Helper>
              No purchase is required to earn any of these, and guests who opted out of messages
              still collect stamps, offers and spins. Nothing here sends messages.
            </Helper>
          </div>

          {step >= 2 && (
            <section className="builder-panel" aria-label="Loyalty tools preview">
              <h3>What guests see</h3>
              <PreviewOnly>Preview only. None of this is live until you publish.</PreviewOnly>
              <PhoneFrame label="Guest tools preview">
                <strong>{restaurant.name}</strong>
                {doubleOn ? (
                  <p>Double stamps every {WEEKDAYS[doubleDay]}.</p>
                ) : (
                  <p>No double stamp day right now.</p>
                )}
                {streakOn ? (
                  <p>
                    Come in {streakVisits} {streakVisits === 1 ? "time" : "times"} a week for{" "}
                    {streakWeeks} weeks and get {streakBonus} bonus{" "}
                    {streakBonus === 1 ? "stamp" : "stamps"}.
                  </p>
                ) : (
                  <p>No visit streak right now.</p>
                )}
                <small>A guest sees these two lines on their card.</small>
              </PhoneFrame>
            </section>
          )}

          {publishBar("Publish these loyalty tools? Guests see them straight away.", saveTools)}
        </section>
      )}

      {tab === "wheel" && (
        <section className="builder-panel" aria-label="Spin wheel">
          <h2>Spin wheel</h2>
          <Switch
            label="Show the spin wheel to guests"
            checked={spin.enabled}
            onChange={(next) => setSpin({ ...spin, enabled: next })}
          />
          <Helper>
            Guests earn spins from visits, never from spending. Results are picked on our side and
            kept in the log. Prizes become personal single-use offers.
          </Helper>
          <div className="builder-fields">
            <label className="builder-field">
              One spin every how many visits?
              <input
                type="number"
                min={1}
                max={50}
                value={spin.earnEveryVisits}
                onChange={(event) => setSpin({ ...spin, earnEveryVisits: Number(event.target.value) })}
              />
            </label>
            <label className="builder-field">
              Weekly prize budget (R)
              <input
                type="number"
                min={0}
                step="0.01"
                value={spin.weeklyBudgetCents / 100}
                onChange={(event) =>
                  setSpin({
                    ...spin,
                    weeklyBudgetCents: Math.round(Number(event.target.value) * 100),
                  })
                }
              />
            </label>
            <Switch
              label="Also give a spin at each reward milestone"
              checked={spin.earnAtMilestone}
              onChange={(next) => setSpin({ ...spin, earnAtMilestone: next })}
            />
          </div>
          <div className="spin-mode-options">
            <h3>Guest spin modes</h3>
            {SPIN_MODES.map(({ mode, title, description }) => (
              <Switch
                key={mode}
                label={title}
                hint={description}
                checked={(spin.modes ?? ["earned"]).includes(mode)}
                onChange={(next) => {
                  const modes = new Set<SpinMode>(spin.modes ?? ["earned"]);
                  if (next) modes.add(mode);
                  else modes.delete(mode);
                  setSpin({ ...spin, modes: [...modes] });
                }}
              />
            ))}
          </div>
          {(spin.modes ?? ["earned"]).includes("reward_decider") && (
            <label className="builder-field">
              Advertised reward value (R)
              <input
                type="number"
                min={0}
                step="0.01"
                value={(spin.rewardFloorCents ?? 0) / 100}
                onChange={(event) =>
                  setSpin({
                    ...spin,
                    rewardFloorCents: Math.round(Number(event.target.value) * 100),
                  })
                }
              />
              <Helper>
                The reward decider never draws a prize worth less than this. It keeps "
                {reward || "your advertised reward"}" as the lowest value.
              </Helper>
            </label>
          )}
          {((spin.modes ?? ["earned"]).includes("reward_decider") ||
            (spin.modes ?? ["earned"]).includes("daily_surprise")) && (
            <Helper>
              The reward decider picks a prize from your list at random when a card fills. The guest
              never chooses, and nothing below the advertised value is given. Daily surprises need a
              special that is live today. If all modes are off, the wheel is hidden.
            </Helper>
          )}
          {(spin.modes ?? ["earned"]).includes("daily_surprise") && (
            <label className="builder-field">
              Daily surprise specials
              <select
                multiple
                value={spin.dailyPool ?? []}
                onChange={(event) =>
                  setSpin({
                    ...spin,
                    dailyPool: Array.from(event.target.selectedOptions, (option) => option.value),
                  })
                }
              >
                {state.specials
                  .filter((special) => special.restaurantId === restaurant.id && special.active)
                  .map((special) => (
                    <option key={special.id} value={special.id}>
                      {special.title}
                    </option>
                  ))}
              </select>
              <Helper>Pick one or more live specials. Hold Ctrl to pick more than one.</Helper>
            </label>
          )}
          <div className="spin-segments">
            <h3>Prizes on the wheel</h3>
            {spin.segments.map((segment) => (
              <div className="spin-segment-row" key={segment.id}>
                <input
                  value={segment.label}
                  placeholder="Prize"
                  aria-label="Prize label"
                  onChange={(event) => setSegment(segment.id, { label: event.target.value })}
                />
                <label>
                  Chance
                  <input
                    type="number"
                    min={0}
                    value={segment.weight}
                    onChange={(event) =>
                      setSegment(segment.id, { weight: Number(event.target.value) })
                    }
                  />
                  <small className="spin-odds">{oddsInWords(segment.weight, spin.segments)}</small>
                </label>
                <label>
                  Value R
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={segment.valueCents / 100}
                    onChange={(event) =>
                      setSegment(segment.id, {
                        valueCents: Math.round(Number(event.target.value) * 100),
                      })
                    }
                  />
                </label>
                <label>
                  Bonus stamps
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={segment.bonusStamps ?? 0}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      const next: SpinSegment = { ...segment };
                      if (value > 0) next.bonusStamps = value;
                      else delete next.bonusStamps;
                      setSegment(segment.id, next);
                    }}
                  />
                </label>
                <label>
                  Most per day
                  <input
                    type="number"
                    min={0}
                    value={segment.cap?.period === "day" ? segment.cap.max : 0}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      const next: SpinSegment = { ...segment };
                      if (value > 0) next.cap = { period: "day", max: value };
                      else delete next.cap;
                      setSegment(segment.id, next);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="builder-secondary"
                  onClick={() =>
                    setSpin({
                      ...spin,
                      segments: spin.segments.filter((item) => item.id !== segment.id),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="builder-secondary"
              disabled={spin.segments.length >= MAX_SPIN_PRIZES}
              onClick={() => setSpin({ ...spin, segments: [...spin.segments, blankSegment()] })}
            >
              Add a prize
            </button>
            {spin.segments.length >= MAX_SPIN_PRIZES && (
              <Helper>The wheel holds up to {MAX_SPIN_PRIZES} prizes. Remove one to add another.</Helper>
            )}
            {weightWarning(spin.segments) && (
              <p className="field-error" role="status">
                {weightWarning(spin.segments)}
              </p>
            )}
          </div>
          <label className="builder-field">
            Rules shown to guests
            <textarea
              rows={5}
              value={spin.rules}
              onChange={(event) => setSpin({ ...spin, rules: event.target.value })}
            />
          </label>
          <div className="page-actions">
            <button
              className="builder-secondary"
              onClick={() =>
                setSpin({
                  ...spin,
                  rules: api.spin.rulesText({ ...restaurant, spin }),
                })
              }
            >
              Write the rules for me
            </button>
          </div>
          <Helper>
            The published rules always include "No purchase is required to earn spins." Only show
            the notice where the rules apply.
          </Helper>

          {step >= 2 && (
            <section className="builder-panel" aria-label="Spin wheel preview">
              <h3>Test the wheel</h3>
              <Helper>
                A test spin draws from these draft prizes only. It never touches your weekly budget
                and never creates an offer, code or reward.
              </Helper>
              {!spin.enabled && (
                <Helper>
                  The wheel is off for guests right now. Turn it on above when you are happy with
                  the prizes.
                </Helper>
              )}
              <PreviewOnly>Preview only. Guests see the wheel after you publish.</PreviewOnly>
              <PhoneFrame label="Guest spin wheel preview">
                <WheelPreview segments={spin.segments} />
              </PhoneFrame>
            </section>
          )}

          {publishBar("Publish the spin wheel? Guests see the new prizes straight away.", saveSpin)}
        </section>
      )}

      {tab === "tiers" && (
        <section className="builder-panel" aria-label="Tiers">
          <h2>Guest tiers</h2>
          <Helper>Tiers are earned by how often a guest visits in 90 days.</Helper>
          <div className="builder-fields">
            <label className="builder-field">
              Regular from how many visits in 90 days?
              <input
                type="number"
                min={1}
                value={regular}
                onChange={(event) => setRegular(Number(event.target.value))}
              />
            </label>
            <label className="builder-field">
              VIP from how many visits in 90 days?
              <input
                type="number"
                min={2}
                value={vip}
                onChange={(event) => setVip(Number(event.target.value))}
              />
            </label>
          </div>
          <Helper>
            Tiers unlock members-only and targeted specials. VIP guests can be the only ones who see
            a particular offer.
          </Helper>

          {step >= 2 && (
            <section className="builder-panel" aria-label="Tiers preview">
              <h3>What guests see</h3>
              <PreviewOnly>Preview only. The tiers stay as they are until you publish.</PreviewOnly>
              <PhoneFrame label="Guest tier preview">
                <strong>{restaurant.name}</strong>
                <p>Regular from {regular} visits in 90 days.</p>
                <p>VIP from {vip} visits in 90 days.</p>
              </PhoneFrame>
            </section>
          )}

          {publishBar("Publish these tiers? Guests see them straight away.", saveTiers)}
        </section>
      )}

      {notice && (
        <p role="status" className="builder-hint">
          {notice}
        </p>
      )}
    </main>
  );
}

function LiveLoyalty({ data }: { data: LiveLoyaltySettings | null }) {
  const [stampsRequired, setStampsRequired] = useState(data?.stampsRequired ?? 8);
  const [reward, setReward] = useState(data?.rewardDescription ?? "");
  const [windowMinutes, setWindowMinutes] = useState(data?.visitWindowMinutes ?? 240);
  const [welcomeStamp, setWelcomeStamp] = useState(data?.welcomeStamp ?? false);
  const [marketingCap, setMarketingCap] = useState(data?.marketingWeeklyCap ?? 3);
  const [memberCap, setMemberCap] = useState(data?.memberWeeklyCap ?? 2);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow="Live mode"
          title="This login is not linked to a restaurant."
          intro="Ask Patron to link your owner account to a restaurant, then sign in again."
        />
      </main>
    );
  }

  const save = async () => {
    setBusy(true);
    const result = await updateLoyaltySettingsFn({
      data: {
        stampsRequired,
        rewardDescription: reward,
        visitWindowMinutes: windowMinutes,
        welcomeStamp,
        marketingWeeklyCap: marketingCap,
        memberWeeklyCap: memberCap,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setStampsRequired(result.settings.stampsRequired);
    setReward(result.settings.rewardDescription);
    setWindowMinutes(result.settings.visitWindowMinutes);
    setWelcomeStamp(result.settings.welcomeStamp);
    setMarketingCap(result.settings.marketingWeeklyCap);
    setMemberCap(result.settings.memberWeeklyCap);
    setNotice("Saved. The live card uses these rules now.");
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Loyalty · ${data.restaurantName}`}
        title="Set the card rules."
        intro="These are the live rules your guests see. Saving here applies them immediately and writes an activity log entry."
        actions={
          <button className="builder-primary" type="button" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save rules"}
          </button>
        }
      />
      <section className="builder-panel">
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
          <FormField label="What the guest gets" hint="Keep it short and plain.">
            <input
              maxLength={120}
              value={reward}
              onChange={(event) => setReward(event.target.value)}
            />
          </FormField>
          <FormField label="Minutes between visits" hint="Zero allows a stamp every time.">
            <input
              type="number"
              min={0}
              max={1440}
              value={windowMinutes}
              onChange={(event) => setWindowMinutes(Number(event.target.value))}
            />
          </FormField>
        </div>
        <Helper>
          A guest can earn one stamp in this window. Keep it at 240 minutes for a normal cafe.
        </Helper>
      </section>
      <section className="builder-panel">
        <h2>Starting stamp</h2>
        <Switch
          checked={welcomeStamp}
          onChange={setWelcomeStamp}
          label="Give one welcome stamp at join"
          hint="A small head start. It does not earn a reward on its own."
        />
      </section>
      <section className="builder-panel">
        <h2>Message limits</h2>
        <div className="builder-fields">
          <FormField label="Marketing SMS each week" hint="0 to 14 messages per guest.">
            <input
              type="number"
              min={0}
              max={14}
              value={marketingCap}
              onChange={(event) => setMarketingCap(Number(event.target.value))}
            />
          </FormField>
          <FormField label="Card messages each week" hint="0 to 14 messages per guest.">
            <input
              type="number"
              min={0}
              max={14}
              value={memberCap}
              onChange={(event) => setMemberCap(Number(event.target.value))}
            />
          </FormField>
        </div>
      </section>
      {notice && (
        <p className="builder-hint" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}
