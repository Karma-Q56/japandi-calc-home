// PLACEHOLDER - M6: Credit & SMS
// In production, this would be a Cloudflare Cron Trigger endpoint
// that dispatches queued SMS messages every minute

export async function POST() {
  return new Response('OK - Placeholder', { status: 200 });
}

export async function GET() {
  return new Response('Method not allowed', { status: 405 });
}
