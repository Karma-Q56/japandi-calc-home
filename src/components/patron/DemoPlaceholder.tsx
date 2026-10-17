import { Link } from '@tanstack/react-router';
import { APP_NAME } from '@/config/app';

export function DemoPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Not built yet · Demo data
      </p>
      <h1>{title} is on its way.</h1>
      <p className="demo-intro">{description}</p>
      <section className="builder-panel">
        <h2>What will live here</h2>
        <p>
          This screen arrives in its milestone with real demo data. Until
          then, the demo hub tunnels below keep working.
        </p>
      </section>
      <p className="demo-data-note">
        This preview is part of {APP_NAME}.{' '}
        <Link to="/demo">Return to demo hub →</Link>
      </p>
    </main>
  );
}
