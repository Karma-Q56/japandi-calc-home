import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/cron/dispatch')({
  POST: async ({ request }) => {
    // Verify CRON_SECRET header
    const cronSecret = import.meta.env.CRON_SECRET;
    const providedSecret = request.headers.get('x-cron-secret');
    
    if (providedSecret !== cronSecret) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    try {
      // In production, dispatch queued messages
      // This runs every minute via Cloudflare Cron Triggers
      
      console.log('[Cron] Dispatching messages...');
      
      // In production:
      // 1. Query for queued messages ready to send
      // 2. For each message, re-check consent, erasure, quiet hours, caps
      // 3. Send via SMS provider
      // 4. Update message status
      
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error(`[Cron] Dispatch error: ${error}`);
      return new Response('Error', { status: 500 });
    }
  },
  GET: async () => {
    return new Response('Method not allowed', { status: 405 });
  },
});
