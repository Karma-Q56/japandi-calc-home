// SMS Provider interface and implementations
import type { SmsProvider } from './types';
import { ConsoleSmsProvider } from './ConsoleSmsProvider';
import { BulkSmsProvider } from './BulkSmsProvider';

// Export the interface
export type { SmsProvider, SmsSendResult, SmsDeliveryEvent, SmsInboundEvent } from './types';

// Available providers
const providers: Record<string, SmsProvider> = {
  console: new ConsoleSmsProvider(),
};

/**
 * Get the configured SMS provider
 */
export function getSmsProvider(): SmsProvider {
  const providerName = (import.meta.env as { SMS_PROVIDER?: string }).SMS_PROVIDER || 'console';
  const provider = providers[providerName];
  
  if (!provider) {
    throw new Error(`Unknown SMS provider: ${providerName}`);
  }
  
  return provider;
}

/**
 * Register a custom SMS provider (for testing or future providers)
 */
export function registerSmsProvider(name: string, provider: SmsProvider): void {
  providers[name] = provider;
}

// Re-export the Console provider for direct use in tests
export { ConsoleSmsProvider, BulkSmsProvider };

/**
 * Build the BulkSMS provider from runtime secrets (Workers: pass the `env` binding; Node: process.env).
 * Secrets: BULKSMS_TOKEN_ID, BULKSMS_TOKEN_SECRET, SMS_WEBHOOK_SECRET; optional SMS_DEFAULT_SENDER.
 */
export function createBulkSmsFromEnv(env: Record<string, string | undefined>): BulkSmsProvider {
  const tokenId = env['BULKSMS_TOKEN_ID'];
  const tokenSecret = env['BULKSMS_TOKEN_SECRET'];
  if (!tokenId || !tokenSecret) throw new Error('BulkSMS credentials are not configured');
  return new BulkSmsProvider({
    tokenId,
    tokenSecret,
    webhookSecret: env['SMS_WEBHOOK_SECRET'] ?? '',
    ...(env['SMS_DEFAULT_SENDER'] ? { defaultFrom: env['SMS_DEFAULT_SENDER'] } : {}),
  });
}
