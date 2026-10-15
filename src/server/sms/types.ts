// SMS Provider types

export interface SmsProvider {
  name: string;
  send(msg: SmsMessage): Promise<SmsSendResult>;
  parseDeliveryWebhook(req: Request): Promise<SmsDeliveryEvent[]>;
  parseInboundWebhook(req: Request): Promise<SmsInboundEvent[]>;
  verifyWebhook(req: Request): Promise<boolean>;
}

export interface SmsMessage {
  to: string; // E.164 phone number
  body: string;
  from?: string; // Sender name or number
  reference: string; // Our internal reference
}

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
  from: string; // E.164 phone number
  body: string;
  at: Date;
}
