import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState, useSyncExternalStore } from 'react';
import { demoRepo, updateDemo } from '@/data/repo';
import { api } from '@/api';
import { fakeSmsProvider } from '@/domain/sms';
import { countLabel } from '@/lib/count-label';
import { requireRole } from '@/data/session';
import { APP_NAME } from '@/config/app';

export const Route = createFileRoute('/demo/outbox')({
  beforeLoad: () => { if (!requireRole('operator')(demoRepo.read().session)) throw redirect({ to: '/demo' }); },
  component: Outbox,
});

function Outbox() {
  const state = useSyncExternalStore(demoRepo.subscribe, demoRepo.read, demoRepo.read);
  const [notice, setNotice] = useState('');
  return <main className="demo-hub page-width"><p className="eyebrow"><span className="eyebrow-line"/>Demo data · No live providers</p><h1>Message outbox.</h1><p className="demo-intro">Messages appear here for review only. Nothing is delivered to real phones or push services.</p><p><button className="builder-primary" onClick={() => { const report = api.campaign.runDispatcher(); setNotice(`Dispatcher: ${report.sent} sent, ${report.skipped} skipped, ${report.held} held, ${report.failed} failed.`); }}>Run dispatcher</button></p><div className="outbox-phone"><div className="outbox-top"><span>{APP_NAME} · Preview</span><span>{countLabel(state.messages.length, "message")}</span></div>{state.messages.map(message => { const customer = state.customers.find(item => item.id === message.customerId); const restaurant = state.restaurants.find(item => item.id === message.restaurantId); const membership = state.memberships.find(item => item.customerId === message.customerId && item.restaurantId === message.restaurantId); return <article className="outbox-message" key={message.id}><div className="outbox-meta"><strong>{customer?.phoneE164 ?? 'Unknown guest'}</strong><span>{restaurant?.name ?? 'Unknown restaurant'}</span></div><p>{message.body}</p><div className="outbox-meta"><span>{message.channel.toUpperCase()} · {message.channel === 'sms' ? `${countLabel(message.segments, 'segment')} · R${(message.costCents / 100).toFixed(2)}` : 'Free push'}</span><span className={`outbox-status ${message.status}`}>{message.status}</span></div><div className="outbox-actions">{message.channel === 'sms' && <button onClick={() => { const result = fakeSmsProvider.simulateDelivery(message.id); setNotice(result ? `Demo receipt: ${result}.` : 'Message not found.'); }}>{message.status === 'queued' ? 'Simulate delivery' : 'Simulate again'}</button>}{message.channel === 'push' && <span className="demo-data-note">Push is recorded in the demo outbox only.</span>}{message.channel === 'sms' && membership && <button onClick={() => { fakeSmsProvider.replyStop(message.customerId, message.restaurantId); setNotice(`STOP recorded for ${restaurant?.name}.`); }}>Reply STOP as this guest</button>}</div></article>; })}</div>{notice && <p className="demo-data-note" role="status">{notice}</p>}<p className="demo-data-note"><Link to="/demo">Return to demo hub →</Link></p></main>;
}
