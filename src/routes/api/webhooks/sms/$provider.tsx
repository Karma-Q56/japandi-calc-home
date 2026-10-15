import { createFileRoute } from '@tanstack/react-router';
import { getSmsProvider } from '@/server/sms';

export const Route = createFileRoute('/api/webhooks/sms/$provider')({
  // Handle both delivery and inbound webhooks
  // In production, this would be split into separate routes or use method detection
  POST: async ({ request, params }) => {
    const { provider: providerName } = params;
    
    // Verify webhook signature
    const smsProvider = getSmsProvider();
    
    try {
      const isValid = await smsProvider.verifyWebhook(request);
      
      if (!isValid) {
        return new Response('Invalid signature', { status: 401 });
      }
      
      // Check the path to determine webhook type
      const path = new URL(request.url).pathname;
      
      if (path.includes('/delivery')) {
        // Handle delivery webhook
        const events = await smsProvider.parseDeliveryWebhook(request);
        
        // Process delivery events
        for (const event of events) {
          console.log(`[SMS Webhook] Delivery: ${event.providerMessageId} -> ${event.status}`);
          
          // In production, update message status in database
        }
        
        return new Response('OK', { status: 200 });
      } else if (path.includes('/inbound')) {
        // Handle inbound webhook
        const events = await smsProvider.parseInboundWebhook(request);
        
        // Process inbound messages
        for (const event of events) {
          console.log(`[SMS Webhook] Inbound: ${event.from} -> ${event.body}`);
          
          // Handle STOP commands
          if (event.body.toUpperCase().includes('STOP')) {
            // In production, opt out the member
            console.log(`[SMS Webhook] STOP request from ${event.from}`);
          }
        }
        
        return new Response('OK', { status: 200 });
      }
      
      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error(`[SMS Webhook] Error: ${error}`);
      return new Response('Error processing webhook', { status: 500 });
    }
  },
  GET: async () => {
    // Webhooks should only accept POST
    return new Response('Method not allowed', { status: 405 });
  },
});
