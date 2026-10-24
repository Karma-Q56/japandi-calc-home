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
  // v2 - one line beside the join button; consent is recorded per restaurant.
  'v2_loyalty': {
    version: 'v2',
    purpose: 'loyalty',
    text: 'I agree to {restaurant} saving my name and number to run my loyalty card.',
  },
  'v2_marketing_sms': {
    version: 'v2',
    purpose: 'marketing_sms',
    text: "By joining you agree to our Terms, Privacy Policy and to receive {restaurant}'s loyalty offers. Reply STOP anytime.",
  },
  'v2_marketing_push': {
    version: 'v2',
    purpose: 'marketing_push',
    text: "Send me notifications about offers from {restaurant}. You can turn this off in Messages settings.",
  },
};

// Current version for each purpose
export const CURRENT_CONSENT_VERSIONS: Record<ConsentPurpose, string> = {
  loyalty: 'v2',
  marketing_sms: 'v2',
  marketing_push: 'v2',
};

// Get current wording for a purpose
export function getConsentWording(purpose: ConsentPurpose, restaurantName: string): ConsentWording {
  const version = CURRENT_CONSENT_VERSIONS[purpose];
  const key = `${version}_${purpose}` as const;
  const wording = CONSENT_WORDING[key];
  
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
  const key = `${version}_${purpose}` as const;
  const wording = CONSENT_WORDING[key];
  
  if (!wording) {
    return null;
  }
  
  return {
    ...wording,
    text: wording.text.replace('{restaurant}', restaurantName),
  };
}

// One line shown beside the join button. Kept in one place so the copy cannot
// drift between the join screen, terms and the recorded consent event.
export function joinConsentLine(restaurantName: string): string {
  return `By joining you agree to our Terms, Privacy Policy and to receive ${restaurantName}'s loyalty offers. Reply STOP anytime.`;
}

// Source types for consent events
export type ConsentSource = 
  | 'join_form'
  | 'card_settings'
  | 'sms_reply'
  | 'opt_out_link'
  | 'operator'
  | 'sms_link'
  | 'messages_settings'
  | 'inbound_stop'
  | 'inbound_stopall';

// Marketing status values
export type MarketingStatus = 'not_opted_in' | 'opted_in' | 'opted_out';
