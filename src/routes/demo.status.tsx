import { createFileRoute } from "@tanstack/react-router";
import { MILESTONE_STATUS } from "@/config/milestones";

export const Route = createFileRoute("/demo/status")({
  component: DemoStatus,
});

function badge(state: string) {
  return <span className={`status-chip status-${state.toLowerCase()}`}>{state}</span>;
}

function DemoStatus() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Progress · Demo data
      </p>
      <h1>Where Patron stands.</h1>
      <p className="demo-intro">
        Every milestone and screen, with a link that signs in as the right demo person. Developer
        notes are hidden in pitch-demo mode (`?pitch=1`).
      </p>
      {MILESTONE_STATUS.map((milestone) => (
        <section className="builder-panel" key={milestone.id}>
          <div className="guest-section-heading">
            <h2>
              {milestone.title} {badge(milestone.state)}
            </h2>
          </div>
          <p>{milestone.summary}</p>
          {milestone.screens.map((screen) => (
            <article className="guest-list-item" key={screen.path}>
              <span>
                <strong>{screen.label}</strong>
                <small>
                  {screen.path} · {screen.description}
                </small>
              </span>
              <span className="status-open">
                {badge(screen.state)}{" "}
                <a className="builder-secondary" href={screen.open}>
                  Open
                </a>
              </span>
            </article>
          ))}
        </section>
      ))}
      <p>
        <a href="/">Back to Patron</a>
      </p>
    </main>
  );
}
