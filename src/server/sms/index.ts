// SMS Provider interface and implementations
import type { SmsProvider } from './types';
import { ConsoleSmsProvider } from './ConsoleSmsProvider';

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
export { ConsoleSmsProvider };
