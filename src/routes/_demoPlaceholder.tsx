import { Link } from '@tanstack/react-router';
import { APP_NAME } from '@/config/app';

export function DemoPlaceholder({ title, description }: { title: string; description: string }) {
  return <main className="demo-hub page-width"><p className="eyebrow"><span className="eyebrow-line"/>Demo data</p><h1>{title}</h1><p className="demo-intro">{description}</p><p className="demo-data-note">This preview is part of {APP_NAME}. <Link to="/demo">Return to demo hub →</Link></p></main>;
}
