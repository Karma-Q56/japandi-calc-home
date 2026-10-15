// SMS Provider types

export interface SmsSendResult {
  providerMessageId: string;
  segments?: number;
  costCents?: number;
}

export interface SmsDeliveryEvent {
  providerMessageId: string;
  status: 'delivered' | 'failed' | 'sent';
  errorCode?: string;
  at: Date;
}

export interface SmsInboundEvent {
  from: string;
  body: string;
  at: Date;
}

export interface SmsProvider {
  name: string;
  
  /**
   * Send an SMS message
   */
  send(msg: {
    to: string;
    body: string;
    from?: string;
    reference: string;
  }): Promise<SmsSendResult>;
  
  /**
   * Parse delivery webhook payload
   */
  parseDeliveryWebhook(req: Request): Promise<SmsDeliveryEvent[]>;
  
  /**
   * Parse inbound webhook payload
   */
  parseInboundWebhook(req: Request): Promise<SmsInboundEvent[]>;
  
  /**
   * Verify webhook signature
   */
  verifyWebhook(req: Request): Promise<boolean>;
}
