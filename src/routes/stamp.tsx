import { createFileRoute, redirect } from '@tanstack/react-router';
import { demoRepo } from '@/data/repo';
import { requireRole } from '@/data/session';
import { DemoPlaceholder } from './_demoPlaceholder';
export const Route = createFileRoute('/stamp')({ beforeLoad: () => { if (!requireRole('staff')(demoRepo.read().session)) throw redirect({ to: '/demo' }); }, component: () => <DemoPlaceholder title="Staff till" description="The demo staff workspace will be built in a later milestone." /> });
