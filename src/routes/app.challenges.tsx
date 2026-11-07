import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import { Badge, ConfirmDialog, EmptyState, FormField, PageHeader } from "@/components/patron/dash";
import { ChallengeRow } from "@/components/patron/ChallengeRow";
import { PhoneFrame, PreviewOnly, PublishSteps } from "@/components/patron/preview";
import { LoyaltyTabs } from "@/components/patron/LoyaltyTabs";
import { getDataModeFn } from "@/server/live";
import { getChallengesFn } from "@/server/live-challenges-fns";
import { LiveChallengesTab } from "@/components/patron/live/LiveChallengesTab";

export const Route = createFileRoute("/app/challenges")({
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
    return { mode, live: await getChallengesFn() };
  },
  component: Challenges,
});

interface ChallengeDraft {
  title: string;
  visits: number;
  windowDays: number;
  bonusStamps: number;
}

function Challenges() {
  const data = Route.useLoaderData();
  if (data.mode === "live") {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow="Loyalty"
          title="Visit challenges"
          intro="A short sprint that pays bonus stamps or a reward. Guests see it on their card."
        />
        <LoyaltyTabs active="challenges" />
        <LiveChallengesTab challenges={data.live} />
      </main>
    );
  }
  return <DemoChallenges />;
}

function DemoChallenges() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const challenges = state.challenges.filter((item) => item.restaurantId === restaurant.id);
  const [title, setTitle] = useState("");
  const [visits, setVisits] = useState(3);
  const [days, setDays] = useState(14);
  const [bonus, setBonus] = useState(1);
  const [draft, setDraft] = useState<ChallengeDraft | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [notice, setNotice] = useState("");
  const [published, setPublished] = useState("");

  const preview = () => {
    const clean = title.trim();
    if (clean.length < 2 || clean.length > 70) {
      setNotice("Give the challenge a title of 2 to 70 letters.");
      return;
    }
    if (visits < 2 || visits > 50) {
      setNotice("Visits must be between 2 and 50.");
      return;
    }
    if (days < 1 || days > 365) {
      setNotice("The window must be 1 to 365 days.");
      return;
    }
    if (bonus < 1 || bonus > 5) {
      setNotice("Bonus stamps must be 1 to 5.");
      return;
    }
    setNotice("");
    setDraft({ title: clean, visits, windowDays: days, bonusStamps: bonus });
    setStep(2);
  };

  /** The only place a challenge reaches guests. */
  const publish = () => {
    if (!draft) return;
    const result = api.loyalty.saveChallenge({ restaurantId: restaurant.id, ...draft });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setPublished(draft.title);
    setDraft(null);
    setStep(3);
  };

  const startAnother = () => {
    setTitle("");
    setVisits(3);
    setDays(14);
    setBonus(1);
    setPublished("");
    setNotice("");
    setStep(1);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Loyalty · ${restaurant.name}`}
        title="Visit challenges"
        intro="A short sprint that pays bonus stamps. You see it as a guest before it goes live."
      />
      <LoyaltyTabs active="challenges" />
      <PublishSteps step={step} labels={["Write", "Preview", "Publish"]} />
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}

      {step === 1 && (
        <>
          <section className="builder-panel">
            <h2>Challenges guests can see</h2>
            {challenges.length === 0 ? (
              <EmptyState
                title="No challenges yet."
                hint="Write one below, preview it as a guest, then publish it."
              />
            ) : (
              <div className="challenge-owner-list">
                {challenges.map((challenge) => (
                  <div className="challenge-owner-row" key={challenge.id}>
                    <div>
                      <strong>{challenge.title}</strong>
                      <small>
                        {challenge.visits} visits in {challenge.windowDays} days · +
                        {challenge.bonusStamps} bonus stamp
                        {challenge.bonusStamps === 1 ? "" : "s"}
                      </small>
                    </div>
                    <Badge tone={challenge.active ? "active" : undefined}>
                      {challenge.active ? "Showing" : "Paused"}
                    </Badge>
                    <button
                      className="builder-secondary"
                      onClick={() => api.loyalty.setChallengeActive(challenge.id, !challenge.active)}
                    >
                      {challenge.active ? "Pause" : "Resume"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="demo-data-note">
              Pause and Resume take effect straight away. They only hide or show a challenge that
              is already written.
            </p>
          </section>

          <section className="builder-panel">
            <h2>Write a challenge</h2>
            <div className="builder-fields">
              <FormField label="Challenge name" hint="What the guest reads.">
                <input
                  value={title}
                  maxLength={70}
                  placeholder="Three visits in 14 days"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </FormField>
              <FormField label="Visits needed" hint="Between 2 and 50.">
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={visits}
                  onChange={(event) => setVisits(Number(event.target.value))}
                />
              </FormField>
              <FormField label="Within how many days" hint="Between 1 and 365.">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                />
              </FormField>
              <FormField label="Bonus stamps" hint="Between 1 and 5, added when earned.">
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={bonus}
                  onChange={(event) => setBonus(Number(event.target.value))}
                />
              </FormField>
            </div>
            <button className="builder-primary" onClick={preview}>
              Preview this challenge
            </button>
          </section>
        </>
      )}

      {step === 2 && draft && (
        <section className="builder-panel">
          <h2>What your guest will see</h2>
          <PhoneFrame label="Guest challenge preview">
            <ChallengeRow
              title={draft.title}
              visits={Math.min(2, draft.visits)}
              needed={draft.visits}
              windowDays={draft.windowDays}
              bonusStamps={draft.bonusStamps}
              done={draft.visits <= 2}
            />
          </PhoneFrame>
          <PreviewOnly>
            Preview only. Guests cannot see this challenge until you publish.
          </PreviewOnly>
          <div className="page-actions">
            <button className="guest-back" onClick={() => setStep(1)}>
              Back to editing
            </button>
            <ConfirmDialog
              label="Publish challenge"
              question={`Publish "${draft.title}"? Guests see it straight away.`}
              confirmLabel="Yes, publish"
              buttonClass="builder-primary"
              onConfirm={publish}
            />
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="builder-panel">
          <h2>{published} is live.</h2>
          <p>Guests can see it on their card and earn the bonus stamps when they finish it.</p>
          <div className="page-actions">
            <button className="builder-primary" onClick={startAnother}>
              Add another challenge
            </button>
            <a className="builder-secondary" href="/app/challenges">
              See all challenges
            </a>
          </div>
        </section>
      )}
    </main>
  );
}
