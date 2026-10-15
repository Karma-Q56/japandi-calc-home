// PLACEHOLDER - M6: Credit & SMS
// In production, this would handle SMS provider webhooks
// for delivery status and inbound messages

export async function POST() {
  return new Response('OK - Placeholder', { status: 200 });
}

export async function GET() {
  return new Response('Method not allowed', { status: 405 });
}
