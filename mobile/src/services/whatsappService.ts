import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';
import type { CardContact, ServerPayload, UserSettings } from '../types';
import {
  createInstallationAuthorizationHeaders,
} from './installationIdentityService';

export const SETTINGS_KEY = '@business_card_scanner/settings';

export const DEFAULT_SETTINGS: UserSettings = {
  greetingTemplate: `Hi {name}, it was great connecting with you today!

Regards,
{sender}`,
  greetingSignature: 'Spineverse Private Limited',
  digitalCardUri: '',
  preferredMode: 'DIRECT_LINK',
  serverBaseUrl: 'http://127.0.0.1:3000',
  defaultCountry: 'IN',
  whatsappConnection: {
    status: 'DISCONNECTED',
    phoneNumber: '',
    connectionId: ''
  }
};

export async function loadSettings(): Promise<UserSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const stored = JSON.parse(raw);

    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      // Development transport: the Android device reaches the PC backend
      // through `adb reverse tcp:3000 tcp:3000`.
      serverBaseUrl: DEFAULT_SETTINGS.serverBaseUrl,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function normalizeE164(phone: string, defaultCountry: CountryCode): string {
  const parsed = parsePhoneNumberFromString(phone, defaultCountry);
  if (!parsed?.isValid()) throw new Error('A valid WhatsApp phone number is required.');
  return parsed.number;
}

function personalize(
  template: string,
  contact: CardContact,
  sender: string
): string {
  const displayName =
    [contact.firstName, contact.lastName]
      .filter(Boolean)
      .join(' ') || 'there';

  const displaySender =
    sender.trim() || 'Spineverse Private Limited';

  return template
    .replace(/\{name\}/gi, displayName)
    .replace(/\{sender\}/gi, displaySender);
}

async function directLink(phone: string, message: string): Promise<void> {
  // WhatsApp expects digits in the phone parameter. E.164 validation is done before this.
  const digits = phone.replace(/\D/g, '');
  const url = `whatsapp://send?phone=${digits}&text=${encodeURIComponent(message)}`;

  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error('WhatsApp is not installed or cannot handle the WhatsApp URL scheme.');
  }
  await Linking.openURL(url);
}

async function automatedEngine(
  settings: UserSettings,
  payload: ServerPayload
): Promise<void> {
  const base = settings.serverBaseUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const authHeaders =
      await createInstallationAuthorizationHeaders(
        base,
      );

    const response = await fetch(`${base}/api/send-greeting`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || `Server returned HTTP ${response.status}.`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function sendGreeting(contact: CardContact): Promise<void> {
  const settings = await loadSettings();
  const e164 = normalizeE164(contact.phone, settings.defaultCountry as CountryCode);
  const message = personalize(
    settings.greetingTemplate,
    contact,
    settings.greetingSignature
  );

  if (settings.preferredMode === 'DIRECT_LINK') {
    // Deep links can prefill text but cannot reliably pre-attach a local image
    // to a specific WhatsApp recipient. The user completes the send in WhatsApp.
    await directLink(e164, message);
    return;
  }

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  await automatedEngine(settings, {
    phone: e164,
    name,
    customMessage: message,
    mediaUrl: settings.digitalCardUri || undefined
  });
}
