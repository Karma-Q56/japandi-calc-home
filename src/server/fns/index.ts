// Server function exports - PLACEHOLDER
// These would be imported and used by route loaders

export const lead = {
  submit: async () => ({ success: false, error: 'Not implemented' }),
  list: async () => ({ leads: [], total: 0 }),
  stats: async () => ({ total: 0, thisWeek: 0, thisMonth: 0 }),
  updateStatus: async () => ({ success: false }),
};

export const auth = {
  staffLogin: async () => ({ success: false, error: 'Not implemented' }),
  customerLogin: async () => ({ success: false, error: 'Not implemented' }),
  sendOtp: async () => ({ success: false, error: 'Not implemented' }),
  validateSession: async () => ({ valid: false }),
  logout: async () => ({ success: false }),
};

export const member = {
  myCards: async () => ({ memberships: [], total: 0 }),
  card: async () => ({ error: 'Not implemented' }),
  join: async () => ({ success: false, error: 'Not implemented' }),
  setConsent: async () => ({ success: false, error: 'Not implemented' }),
  optOut: async () => ({ success: false, error: 'Not implemented' }),
  consentHistory: async () => ({ events: [] }),
};

export const restaurant = {
  getPublic: async () => ({ error: 'Not implemented' }),
  create: async () => ({ success: false, error: 'Not implemented' }),
  update: async () => ({ success: false, error: 'Not implemented' }),
  list: async () => ({ restaurants: [] }),
  getById: async () => ({ restaurant: null }),
};

export const stamp = {
  lookup: async () => ({ error: 'Not implemented' }),
  record: async () => ({ success: false, error: 'Not implemented' }),
  redeem: async () => ({ success: false, error: 'Not implemented' }),
  undo: async () => ({ success: false, error: 'Not implemented' }),
  history: async () => ({ stamps: [] }),
};
