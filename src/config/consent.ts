// Consent wording versions - insert-only, stored with every consent event

export type ConsentPurpose = 'loyalty' | 'marketing_sms' | 'marketing_push';
export type ConsentAction = 'granted' | 'withdrawn';

export interface ConsentWording {
  version: string;
  purpose: ConsentPurpose;
  text: string;
}

// Version history - newest first
// When changing wording, add a new version, never modify existing ones
export const CONSENT_WORDING: Record<string, ConsentWording> = {
  // v1 - Initial version
  'v1_loyalty': {
    version: 'v1',
    purpose: 'loyalty',
    text: 'I agree to {restaurant} saving my number and name to run my loyalty card.',
  },
  'v1_marketing_sms': {
    version: 'v1',
    purpose: 'marketing_sms',
    text: 'Send me offers by SMS from {restaurant}. Reply STOP any time.',
  },
  'v1_marketing_push': {
    version: 'v1',
    purpose: 'marketing_push',
    text: 'Send me notifications about offers from {restaurant}.',
  },
};

// Current version for each purpose
export const CURRENT_CONSENT_VERSIONS: Record<ConsentPurpose, string> = {
  loyalty: 'v1',
  marketing_sms: 'v1',
  marketing_push: 'v1',
};

// Get current wording for a purpose
export function getConsentWording(purpose: ConsentPurpose, restaurantName: string): ConsentWording {
  const version = CURRENT_CONSENT_VERSIONS[purpose];
  const wording = CONSENT_WORDING[`${version}_${purpose}`];
  
  if (!wording) {
    throw new Error(`No consent wording found for purpose: ${purpose}`);
  }
  
  return {
    ...wording,
    text: wording.text.replace('{restaurant}', restaurantName),
  };
}

// Get wording by version and purpose (for historical lookups)
export function getConsentWordingByVersion(version: string, purpose: ConsentPurpose, restaurantName: string): ConsentWording | null {
  const wording = CONSENT_WORDING[`${version}_${purpose}`];
  
  if (!wording) {
    return null;
  }
  
  return {
    ...wording,
    text: wording.text.replace('{restaurant}', restaurantName),
  };
}

// Source types for consent events
export type ConsentSource = 
  | 'join_form'
  | 'card_settings'
  | 'sms_reply'
  | 'opt_out_link'
  | 'operator'
  | 'sms_link';

// Marketing status values
export type MarketingStatus = 'not_opted_in' | 'opted_in' | 'opted_out';
