// Application configuration - browser-safe constants
export const APP_NAME = 'Patron';
export const APP_ENV = import.meta.env.APP_ENV || 'development';
export const IS_PRODUCTION = APP_ENV === 'production';
export const IS_STAGING = APP_ENV === 'staging';
export const IS_DEVELOPMENT = APP_ENV === 'development';

// South Africa timezone
export const TIMEZONE = 'Africa/Johannesburg';

// Currency formatting
export const CURRENCY = 'ZAR';
export const LOCALE = 'en-ZA';

// Default values
export const DEFAULT_STAMPS_REQUIRED = 8;
export const DEFAULT_VISIT_WINDOW_MINUTES = 240; // 4 hours
export const DEFAULT_REWARD_DESCRIPTION = 'A free item on us';
export const DEFAULT_MARKETING_WEEKLY_CAP = 3;
export const DEFAULT_MEMBER_WEEKLY_CAP = 2;

// Rate limits
export const RATE_LIMITS = {
  otp: {
    perPhone: { attempts: 3, windowMinutes: 15 },
    perPhoneDaily: { attempts: 10, windowHours: 24 },
    perIp: { attempts: 20, windowHours: 1 },
    perJoinLink: { attempts: 200, windowHours: 1 },
  },
  pin: {
    maxAttempts: 5,
    lockoutMinutes: 15,
  },
  join: {
    perIp: { attempts: 6, windowMinutes: 1 },
  },
};

// Quiet hours (local time in Johannesburg)
export const QUIET_HOURS = {
  start: 20, // 8 PM
  end: 8,   // 8 AM
};

// WhatsApp configuration
export const WHATSAPP = {
  number: import.meta.env.WHATSAPP_NUMBER || '',
  businessName: APP_NAME,
};

// SMS configuration
export const SMS = {
  defaultSender: import.meta.env.SMS_DEFAULT_SENDER || APP_NAME,
  otpCostCents: 30, // R0.30 per OTP in v1
};

// Operator configuration
export const OPERATOR_PHONES = (import.meta.env.OPERATOR_PHONES || '').split(',').filter(Boolean);

// Application URLs
export const APP_URL = import.meta.env.APP_URL || 'http://localhost:5173';

// Reserved slugs that cannot be used by restaurants
export const RESERVED_SLUGS = new Set([
  'app', 'me', 'stamp', 'ops', 'u', 'api', 'login', 'r', 's',
  'privacy', 'terms', 'healthz', 'sw', 'manifest',
]);

// PWA configuration
export const PWA = {
  scope: '/',
  display: 'standalone' as const,
};
