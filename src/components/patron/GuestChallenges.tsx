import type { GuestChallenge } from "@/server/live-challenges";

/** Challenges a guest can work towards on their card. Progress comes from the server. */
export function GuestChallenges({ challenges }: { challenges: GuestChallenge[] }) {
  if (challenges.length === 0) return null;
  return (
    <section className="gx-panel" aria-labelledby="guest-challenges-heading">
      <div className="guest-section-heading">
        <h2 id="guest-challenges-heading">Challenges</h2>
        <span>{challenges.length}</span>
      </div>
      {challenges.map((challenge) => {
        const done = challenge.claimed || challenge.progress >= challenge.visits;
        return (
          <article className="visit-row" key={challenge.id}>
            <span>
              <strong>{challenge.title}</strong>
              <br />
              <small>
                {challenge.claimed
                  ? "Done. Your reward is on your card."
                  : `${Math.min(challenge.progress, challenge.visits)} of ${challenge.visits} in ${challenge.windowDays} days`}
              </small>
            </span>
            <strong>{done && !challenge.claimed ? "Reward due" : challenge.rewardLine}</strong>
          </article>
        );
      })}
    </section>
  );
}
