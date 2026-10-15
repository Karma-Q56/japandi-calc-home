// Console SMS Provider - for development
// Logs OTP codes to console and returns them in development mode

import type { SmsProvider, SmsSendResult, SmsDeliveryEvent, SmsInboundEvent } from './types';
import { APP_ENV, IS_DEVELOPMENT } from '@/config/app';

export class ConsoleSmsProvider implements SmsProvider {
  name = 'console';

  private otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();
  private messageIdCounter = 0;

  async send(msg: { to: string; body: string; from?: string; reference: string }): Promise<SmsSendResult> {
    const messageId = `console-${++this.messageIdCounter}-${Date.now()}`;

    console.log(`[ConsoleSmsProvider] To: ${msg.to}`);
    console.log(`[ConsoleSmsProvider] From: ${msg.from || 'default'}`);
    console.log(`[ConsoleSmsProvider] Body: ${msg.body}`);
    console.log(`[ConsoleSmsProvider] Reference: ${msg.reference}`);

    // Extract OTP code if this looks like an OTP message
    const otpMatch = msg.body.match(/(\d{6})/);
    if (otpMatch) {
      const code = otpMatch[1];
      this.otpStore.set(messageId, {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
        attempts: 0,
      });

      // In development, return the OTP code to the client for testing
      if (IS_DEVELOPMENT) {
        console.log(`[ConsoleSmsProvider] OTP Code: ${code}`);
      }
    }

    return {
      providerMessageId: messageId,
      segments: Math.ceil(msg.body.length / 160),
      costCents: 0, // Free in console mode
    };
  }

  async parseDeliveryWebhook(req: Request): Promise<SmsDeliveryEvent[]> {
    // Console provider doesn't receive real webhooks
    // For testing, we can simulate delivery
    const body = await req.text();
    
    try {
      const data = JSON.parse(body);
      if (data.simulateDelivery) {
        return [{
          providerMessageId: data.messageId || 'test-message',
          status: 'delivered',
          at: new Date(),
        }];
      }
    } catch {
      // Not JSON, ignore
    }

    return [];
  }

  async parseInboundWebhook(req: Request): Promise<SmsInboundEvent[]> {
    // Handle STOP commands and other inbound messages for testing
    const body = await req.text();
    
    try {
      const data = JSON.parse(body);
      if (data.simulateInbound) {
        return [{
          from: data.from || '+27000000001',
          body: data.body || 'STOP',
          at: new Date(),
        }];
      }
    } catch {
      // Not JSON, ignore
    }

    return [];
  }

  async verifyWebhook(req: Request): Promise<boolean> {
    // In development, always verify for testing
    return IS_DEVELOPMENT;
  }

  /**
   * Verify an OTP code (for testing purposes)
   */
  verifyOtp(messageId: string, code: string): boolean {
    const entry = this.otpStore.get(messageId);
    
    if (!entry) {
      return false;
    }

    // Check expiry
    if (Date.now() > entry.expiresAt) {
      this.otpStore.delete(messageId);
      return false;
    }

    // Check attempts
    if (entry.attempts >= 5) {
      return false;
    }

    // Check code
    if (entry.code !== code) {
      entry.attempts++;
      return false;
    }

    // Success - remove the OTP
    this.otpStore.delete(messageId);
    return true;
  }

  /**
   * Get the OTP code for a message (for testing in development)
   */
  getOtpForTesting(messageId: string): string | null {
    if (!IS_DEVELOPMENT) {
      return null;
    }
    const entry = this.otpStore.get(messageId);
    return entry?.code || null;
  }
}
