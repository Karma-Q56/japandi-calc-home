import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { StampSlots } from "@/components/patron/StampSlots";
import { Switch } from "@/components/patron/Switch";
import { SPIN_MODES } from "@/domain/spins";
import type { SpinConfig, SpinMode, SpinSegment } from "@/data/types";

export const Route = createFileRoute("/app/loyalty")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: Loyalty,
});

function blankSegment(): SpinSegment {
  return {
    id: `segment-${crypto.randomUUID()}`,
    label: "",
    weight: 10,
    valueCents: 0,
  };
}

function Loyalty() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [stampsRequired, setStampsRequired] = useState(restaurant.stampsRequired);
  const [reward, setReward] = useState(restaurant.rewardDescription);
  const [windowMinutes, setWindowMinutes] = useState(restaurant.visitWindowMinutes);
  const [welcomeStamps, setWelcomeStamps] = useState(restaurant.welcomeStamps);
  const [regular, setRegular] = useState(restaurant.tiers.regular);
  const [vip, setVip] = useState(restaurant.tiers.vip);
  const [mystery, setMystery] = useState(restaurant.mysteryEveryVisits);
  const [birthday, setBirthday] = useState(restaurant.birthdayReward);
  const [spin, setSpin] = useState<SpinConfig>(restaurant.spin);
  const [notice, setNotice] = useState("");
  const [challengeTitle, setChallengeTitle] = useState("Three visits in 14 days");
  const [challengeVisits, setChallengeVisits] = useState(3);
  const [challengeDays, setChallengeDays] = useState(14);
  const [challengeBonus, setChallengeBonus] = useState(1);

  const challenges = state.challenges.filter(
    (item) => item.restaurantId === restaurant.id,
  );

  const save = () => {
    if (stampsRequired < 2 || stampsRequired > 30) {
      setNotice("Stamps required must be between 2 and 30.");
      return;
    }
    if (reward.trim().length < 1 || reward.trim().length > 80) {
      setNotice("Reward text must be 1 to 80 characters.");
      return;
    }
    if (welcomeStamps < 0 || welcomeStamps > stampsRequired - 1) {
      setNotice(`Welcome stamps must be 0 to ${stampsRequired - 1}.`);
      return;
    }
    if (regular < 1 || vip <= regular) {
      setNotice("VIP visits must be higher than Regular visits.");
      return;
    }
    const result = api.restaurant.update(restaurant.id, {
      stampsRequired,
      rewardDescription: reward.trim(),
      visitWindowMinutes: windowMinutes,
      welcomeStamps,
      welcomeStamp: welcomeStamps > 0,
      tiers: { regular, vip },
      mysteryEveryVisits: mystery,
      birthdayReward: birthday,
    });
    setNotice(result.ok ? "Loyalty rules saved." : result.error.message);
  };

  const saveSpin = () => {
    const result = api.spin.saveConfig({ restaurantId: restaurant.id, config: spin });
    setNotice(result.ok ? "Spin wheel saved." : result.error.message);
  };

  const setSegment = (id: string, patch: Partial<SpinSegment>) => {
    setSpin((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === id ? { ...segment, ...patch } : segment,
      ),
    }));
  };

  const addChallenge = () => {
    const result = api.loyalty.saveChallenge({
      restaurantId: restaurant.id,
      title: challengeTitle,
      visits: challengeVisits,
      windowDays: challengeDays,
      bonusStamps: challengeBonus,
    });
    setNotice(result.ok ? "Challenge saved." : result.error.message);
  };

  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Loyalty · {restaurant.name}
      </p>
      <h1>The card rules.</h1>
      <p className="demo-intro">
        Changing rules never alters rewards already earned. Stamps above a lowered threshold convert
        on the next stamp.
      </p>

      <section className="builder-panel">
        <h2>Card</h2>
        <div className="builder-fields">
          <label className="builder-field">
            Stamps required (2–30)
            <input
              type="number"
              min={2}
              max={30}
              value={stampsRequired}
              onChange={(event) => setStampsRequired(Number(event.target.value))}
            />
          </label>
          <label className="builder-field">
            Reward (noun phrase, 80 chars)
            <input
              value={reward}
              maxLength={80}
              onChange={(event) => setReward(event.target.value)}
            />
          </label>
          <label className="builder-field">
            Visit window (minutes)
            <input
              type="number"
              min={30}
              value={windowMinutes}
              onChange={(event) => setWindowMinutes(Number(event.target.value))}
            />
          </label>
          <label className="builder-field">
            Welcome stamps (0–{Math.max(0, stampsRequired - 1)})
            <input
              type="number"
              min={0}
              max={Math.max(0, stampsRequired - 1)}
              value={welcomeStamps}
              onChange={(event) => setWelcomeStamps(Number(event.target.value))}
            />
            <small>
              Granted once when a guest joins, as welcome stamp events. The join screen shows “You
              start with {welcomeStamps} stamp{welcomeStamps === 1 ? "" : "s"}.”
            </small>
          </label>
        </div>
        <div className="live-preview">
          <StampSlots
            filled={Math.min(welcomeStamps, stampsRequired - 1)}
            total={stampsRequired}
            theme={restaurant.theme}
          />
          <p>
            {stampsRequired} stamps to {reward || "…"}
            {welcomeStamps > 0 ? ` · welcome starts at ${welcomeStamps}` : ""}
          </p>
        </div>
      </section>

      <section className="builder-panel">
        <h2>Tiers &amp; extras</h2>
        <div className="builder-fields">
          <label className="builder-field">
            Regular tier at (visits in 90 days)
            <input
              type="number"
              min={1}
              value={regular}
              onChange={(event) => setRegular(Number(event.target.value))}
            />
          </label>
          <label className="builder-field">
            VIP tier at (visits in 90 days)
            <input
              type="number"
              min={2}
              value={vip}
              onChange={(event) => setVip(Number(event.target.value))}
            />
          </label>
          <label className="builder-field">
            Mystery stamp every N visits (0 = off)
            <input
              type="number"
              min={0}
              max={50}
              value={mystery}
              onChange={(event) => setMystery(Number(event.target.value))}
            />
          </label>
          <Switch
            label="Birthday bonus stamp"
            hint="Once a year, in the birthday week"
            checked={birthday}
            onChange={setBirthday}
          />
        </div>
        <p className="demo-data-note">
          Tiers unlock members-only and targeted specials. VIP members can be the only ones who see
          a particular offer.
        </p>
        <button className="builder-primary" onClick={save}>
          Save loyalty rules
        </button>
      </section>

      <section className="builder-panel">
        <h2>Spin wheel</h2>
        <Switch
          label="Show the spin wheel to guests"
          checked={spin.enabled}
          onChange={(next) => setSpin({ ...spin, enabled: next })}
        />
        <p className="demo-data-note">
          Guests earn spins from visits, never from spending. Results are picked on the server and
          logged. Prizes become personal single-use offers.
        </p>
        <div className="builder-fields">
          <label className="builder-field">
            One spin every N visits
            <input
              type="number"
              min={1}
              max={50}
              value={spin.earnEveryVisits}
              onChange={(event) =>
                setSpin({ ...spin, earnEveryVisits: Number(event.target.value) })
              }
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
            label="Also award a spin at each reward milestone"
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
            <small>
              The reward decider never draws a prize worth less than this, it keeps “
              {reward || "your advertised reward"}” as the floor.
            </small>
          </label>
        )}
        {((spin.modes ?? ["earned"]).includes("reward_decider") || (spin.modes ?? ["earned"]).includes("daily_surprise")) && (
          <p className="demo-data-note">Reward decider draws from your prize list at random when a card completes; the guest never chooses, and nothing below the advertised reward is awarded. Daily surprises require an active, in-date special. If all modes are off, the wheel is hidden.</p>
        )}
        {(spin.modes ?? ["earned"]).includes("daily_surprise") && (
          <label className="builder-field">
            Daily surprise specials
            <select
              multiple
              value={spin.dailyPool ?? []}
              onChange={(event) => setSpin({ ...spin, dailyPool: Array.from(event.target.selectedOptions, (option) => option.value) })}
            >
              {state.specials.filter((special) => special.restaurantId === restaurant.id && special.active).map((special) => (
                <option key={special.id} value={special.id}>{special.title}</option>
              ))}
            </select>
            <small>Select one or more active specials. Hold Ctrl/⌘ to select multiple.</small>
          </label>
        )}
        <div className="spin-segments">
          <h3>Segments</h3>
          {spin.segments.map((segment) => (
            <div className="spin-segment-row" key={segment.id}>
              <input
                value={segment.label}
                placeholder="Prize"
                aria-label="Prize label"
                onChange={(event) => setSegment(segment.id, { label: event.target.value })}
              />
              <label>
                Weight
                <input
                  type="number"
                  min={0}
                  value={segment.weight}
                  onChange={(event) =>
                    setSegment(segment.id, { weight: Number(event.target.value) })
                  }
                />
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
                Daily cap
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
                className="guest-back"
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
            onClick={() => setSpin({ ...spin, segments: [...spin.segments, blankSegment()] })}
          >
            Add segment
          </button>
        </div>
        <label className="builder-field">
          Rules and T&amp;Cs shown to guests
          <textarea
            rows={5}
            value={spin.rules}
            onChange={(event) => setSpin({ ...spin, rules: event.target.value })}
          />
        </label>
        <div className="page-actions">
          <button className="builder-primary" onClick={saveSpin}>
            Save spin wheel
          </button>
          <button
            className="builder-secondary"
            onClick={() =>
              setSpin({
                ...spin,
                rules: api.spin.rulesText({ ...restaurant, spin }),
              })
            }
          >
            Generate rules text
          </button>
        </div>
        <p className="demo-data-note">
          The published rules always include “No purchase is required to earn spins.” Only show the
          notice where the rules apply.
        </p>
      </section>

      <section className="builder-panel">
        <h2>Visit challenges</h2>
        {challenges.map((challenge) => (
          <div className="challenge-owner-row" key={challenge.id}>
            <div>
              <strong>{challenge.title}</strong>
              <small>
                {challenge.visits} visits in {challenge.windowDays} days · +{challenge.bonusStamps}{" "}
                bonus stamp{challenge.bonusStamps === 1 ? "" : "s"}
              </small>
            </div>
            <button
              className="builder-secondary"
              onClick={() =>
                api.loyalty.setChallengeActive(challenge.id, !challenge.active)
              }
            >
              {challenge.active ? "Pause" : "Resume"}
            </button>
          </div>
        ))}
        <div className="builder-fields">
          <label className="builder-field">
            Challenge name
            <input
              value={challengeTitle}
              onChange={(event) => setChallengeTitle(event.target.value)}
            />
          </label>
          <label className="builder-field">
            Visits
            <input
              type="number"
              min={2}
              value={challengeVisits}
              onChange={(event) => setChallengeVisits(Number(event.target.value))}
            />
          </label>
          <label className="builder-field">
            Within days
            <input
              type="number"
              min={1}
              value={challengeDays}
              onChange={(event) => setChallengeDays(Number(event.target.value))}
            />
          </label>
          <label className="builder-field">
            Bonus stamps
            <input
              type="number"
              min={1}
              max={5}
              value={challengeBonus}
              onChange={(event) => setChallengeBonus(Number(event.target.value))}
            />
          </label>
        </div>
        <button className="builder-secondary" onClick={addChallenge}>
          Add challenge
        </button>
      </section>

      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}
    </main>
  );
}
