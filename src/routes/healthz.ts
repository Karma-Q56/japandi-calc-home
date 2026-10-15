import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/healthz')({
  loader: async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  },
  head: () => ({ title: 'Health Check' }),
  component: HealthCheck,
});

function HealthCheck() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-green-600">OK</h1>
        <p className="text-gray-500 mt-2">Service is running</p>
      </div>
    </div>
  );
}
