export type WhatsAppMode = 'DIRECT_LINK' | 'AUTOMATED_ENGINE';

export interface CardContact {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company: string;
  rawText?: string;
  imageUri?: string;
}

export interface UserSettings {
  greetingTemplate: string;
  digitalCardUri: string;
  preferredMode: WhatsAppMode;
  serverBaseUrl: string;
  defaultCountry: string;
}

export interface ServerPayload {
  phone: string;
  name: string;
  customMessage: string;
  mediaUrl?: string;
}

export interface ParsedCard extends CardContact {
  rawText: string;
}
