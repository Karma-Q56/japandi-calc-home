import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '@/api';

export const Route = createFileRoute('/u/$token')({ component: OptOutPage });
function OptOutPage() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<'ready' | 'done' | 'invalid'>('ready');
  const confirm = async () => {
    const result = await api.member.optOutByToken(token);
    setStatus(result.ok ? 'done' : 'invalid');
  };
  return <main className="guest-page"><section className="guest-panel optout-panel"><p className="eyebrow">Message preferences</p><h1>{status === 'done' ? 'You’re opted out.' : status === 'invalid' ? 'This link has expired.' : 'Stop marketing messages?'}</h1><p>{status === 'done' ? 'Marketing SMS consent has been withdrawn. Your loyalty card remains available.' : status === 'invalid' ? 'This opt-out link is invalid or expired. You can update preferences in card settings.' : 'Confirm to stop promotional SMS from this restaurant. Your loyalty card will continue to work.'}</p>{status === 'ready' && <button className="builder-primary" onClick={confirm}>Confirm opt out</button>}<a href="/">Back to Patron</a></section></main>;
}
