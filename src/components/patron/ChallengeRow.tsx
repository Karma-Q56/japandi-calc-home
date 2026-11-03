/** One visit challenge exactly as a guest reads it. */
export function ChallengeRow(props: {
  title: string;
  visits: number;
  needed: number;
  windowDays: number;
  bonusStamps: number;
  done: boolean;
  claimed?: boolean;
}) {
  const percent = Math.min(100, Math.round((props.visits / Math.max(1, props.needed)) * 100));
  return (
    <article className="challenge-row">
      <div>
        <strong>{props.title}</strong>
        <small>
          {props.visits} of {props.needed} visits in the last {props.windowDays} days
        </small>
      </div>
      <span className={props.done ? "challenge-state is-done" : "challenge-state"}>
        {props.claimed
          ? "Bonus added"
          : props.done
            ? "Earned"
            : `+${props.bonusStamps} bonus stamp${props.bonusStamps === 1 ? "" : "s"}`}
      </span>
      <div className="challenge-track" aria-hidden>
        <span style={{ width: `${percent}%` }} />
      </div>
    </article>
  );
}
