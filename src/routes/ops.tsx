import { withChildren } from '@/lib/nested';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { demoRepo } from '@/data/repo';
import { requireRole } from '@/data/session';
import { DemoPlaceholder } from './_demoPlaceholder';
const OpsPage = withChildren(() => <DemoPlaceholder title="Operator console" description="Restaurant setup, themes and menus are coming next." />);
export const Route = createFileRoute('/ops')({ beforeLoad: () => { if (!requireRole('operator')(demoRepo.read().session)) throw redirect({ to: '/demo' }); }, component: OpsPage });
