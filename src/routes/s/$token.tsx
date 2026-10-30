import { createFileRoute, redirect } from '@tanstack/react-router';
import { demoRepo } from '@/data/repo';
import { setDemoSession } from '@/data/session';

export const Route = createFileRoute('/s/$token')({ beforeLoad: ({ params }) => {
  const customer = demoRepo.read().customers.find(item => item.qrToken === params.token && !item.deleted);
  if (!customer) throw redirect({ to: '/login' });
  setDemoSession({ role: 'guest', customerId: customer.id });
  throw redirect({ to: '/me' });
} });
