// Console SMS Provider - for development only
// Logs OTP codes to console, returns them to client in development mode

import type { SmsProvider, SmsMessage, SmsSendResult, SmsDeliveryEvent, SmsInboundEvent } from './types';
import { APP_ENV, IS_DEVELOPMENT } from '@/config/app';

export class ConsoleSmsProvider implements SmsProvider {
  name = 'console';

  async send(msg: SmsMessage): Promise<SmsSendResult> {
    const { to, body, reference } = msg;
    
    // Log the message
    console.log(`[ConsoleSmsProvider] To: ${to}`);
    console.log(`[ConsoleSmsProvider] Body: ${body}`);
    console.log(`[ConsoleSmsProvider] Reference: ${reference}`);
    
    // In development mode, return the OTP code if this looks like an OTP message
    if (IS_DEVELOPMENT && body.match(/\b\d{6}\b/)) {
      const otp = body.match(/\b\d{6}\b/)?.[0] || '';
      console.log(`[ConsoleSmsProvider] OTP: ${otp}`);
    }
    
    // Return a mock result
    return {
      providerMessageId: `console-${Date.now()}`,
      segments: 1,
      costCents: 0, // No cost in development
    };
  }

  async parseDeliveryWebhook(_req: Request): Promise<SmsDeliveryEvent[]> {
    // Console provider doesn't have real webhooks
    return [];
  }

  async parseInboundWebhook(_req: Request): Promise<SmsInboundEvent[]> {
    // Console provider doesn't have real webhooks
    return [];
  }

  async verifyWebhook(_req: Request): Promise<boolean> {
    // Console provider doesn't verify webhooks
    return true;
  }
}
