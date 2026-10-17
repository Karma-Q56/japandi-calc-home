import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { StampSlots } from "@/components/patron/StampSlots";

export const Route = createFileRoute("/app/loyalty")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
    }
  },
  component: Loyalty,
});

function Loyalty() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [stampsRequired, setStampsRequired] = useState(restaurant.stampsRequired);
  const [reward, setReward] = useState(restaurant.rewardDescription);
  const [windowMinutes, setWindowMinutes] = useState(restaurant.visitWindowMinutes);
  const [welcome, setWelcome] = useState(restaurant.welcomeStamp);
  const [notice, setNotice] = useState("");

  const save = () => {
    if (stampsRequired < 2 || stampsRequired > 30) {
      setNotice("Stamps required must be between 2 and 30.");
      return;
    }
    if (reward.trim().length < 1 || reward.trim().length > 80) {
      setNotice("Reward text must be 1 to 80 characters.");
      return;
    }
    const result = api.restaurant.update(restaurant.id, {
      stampsRequired,
      rewardDescription: reward.trim(),
      visitWindowMinutes: windowMinutes,
      welcomeStamp: welcome,
    });
    setNotice(result.ok ? "Loyalty rules saved." : result.error.message);
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
        <label className="guest-consent">
          <input
            type="checkbox"
            checked={welcome}
            onChange={(event) => setWelcome(event.target.checked)}
          />
          <span>Welcome stamp for new members</span>
        </label>
      </div>
      <button className="builder-primary" onClick={save}>
        Save rules
      </button>
      <section className="builder-panel">
        <h2>Live preview</h2>
        <StampSlots
          filled={Math.min(5, stampsRequired - 1)}
          total={stampsRequired}
          theme={restaurant.theme}
        />
        <p>
          {stampsRequired} stamps to {reward || "…"}
        </p>
      </section>
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}
    </main>
  );
}
