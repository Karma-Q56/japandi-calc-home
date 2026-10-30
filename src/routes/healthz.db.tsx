import { createFileRoute } from '@tanstack/react-router';
import { checkDatabase } from '../server/db';

export const Route = createFileRoute('/healthz/db')({
  loader: async () => {
    const databaseUrl = (import.meta.env as { DATABASE_URL?: string }).DATABASE_URL;

    if (!databaseUrl) {
      return {
        status: 'error',
        error: 'DATABASE_URL not configured',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const startTime = Date.now();
      const result = await checkDatabase(databaseUrl);
      const latencyMs = Date.now() - startTime;

      return {
        status: result === 1 ? 'ok' : 'error',
        database: 'connected',
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }
  },
  component: DatabaseHealthCheck,
});

function DatabaseHealthCheck() {
  const loaderData = Route.useLoaderData();

  if (loaderData.status === 'ok') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-600">OK</h1>
          <p className="text-gray-500 mt-2">Database: {loaderData.database}</p>
          <p className="text-gray-500">Latency: {loaderData.latencyMs}ms</p>
          <p className="text-gray-400 text-sm mt-4">{loaderData.timestamp}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600">ERROR</h1>
        <p className="text-gray-500 mt-2">Database: {loaderData.database}</p>
        {loaderData.error && <p className="text-red-500 mt-2">{loaderData.error}</p>}
        <p className="text-gray-400 text-sm mt-4">{loaderData.timestamp}</p>
      </div>
    </div>
  );
}
