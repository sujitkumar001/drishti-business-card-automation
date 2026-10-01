import TextRecognition from '@react-native-ml-kit/text-recognition';
import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';
import type { ParsedCard } from '../types';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_CANDIDATE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;

const TITLE_WORDS = new Set([
  'ceo', 'cto', 'cfo', 'coo', 'founder', 'co-founder', 'manager', 'director',
  'engineer', 'developer', 'consultant', 'president', 'sales', 'marketing',
  'proprietor', 'owner', 'chairman', 'vice president', 'vp'
]);

const COMPANY_RE =
  /\b(pvt\.?\s*ltd\.?|private\s+limited|ltd\.?|limited|llc|inc\.?|incorporated|corp\.?|corporation|company|co\.?|llp|plc|solutions|technologies|technology|systems|industries|enterprises|group)\b/i;

const DOMAINISH_RE = /\b(?:www\.|https?:\/\/|\.com\b|\.in\b|\.org\b|\.net\b|\.io\b|\.co\b)/i;

function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').replace(/^[|•·\-–—\s]+|[|•·\-–—\s]+$/g, '').trim();
}

function normalizePhone(candidate: string, defaultCountry: CountryCode): string {
  const parsed = parsePhoneNumberFromString(candidate, defaultCountry);
  return parsed?.isValid() ? parsed.number : '';
}

function looksLikeName(line: string): boolean {
  if (!line || line.length < 3 || line.length > 60) return false;
  if (EMAIL_RE.test(line)) { EMAIL_RE.lastIndex = 0; return false; }
  EMAIL_RE.lastIndex = 0;
  if (DOMAINISH_RE.test(line) || COMPANY_RE.test(line)) return false;
  if (/\d{3,}/.test(line)) return false;

  const lower = line.toLowerCase();
  if ([...TITLE_WORDS].some((title) => lower === title || lower.includes(` ${title}`))) return false;

  const words = line.split(/\s+/);
  return words.length >= 1 && words.length <= 5 && words.every((w) => /^[A-Za-z.'’-]+$/.test(w));
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { firstName: words[0] ?? '', lastName: '' };
  return { firstName: words[0], lastName: words.slice(1).join(' ') };
}

export function parseBusinessCardText(
  rawText: string,
  defaultCountry: CountryCode = 'IN'
): ParsedCard {
  const lines = rawText.split(/\r?\n/).map(cleanLine).filter(Boolean);

  const email = rawText.match(EMAIL_RE)?.[0]?.toLowerCase() ?? '';

  const phoneCandidates = rawText.match(PHONE_CANDIDATE_RE) ?? [];
  const phone =
    phoneCandidates
      .map((value) => normalizePhone(value, defaultCountry))
      .find(Boolean) ?? '';

  const company =
    lines.find((line) => COMPANY_RE.test(line) && !DOMAINISH_RE.test(line)) ?? '';

  const nameLine = lines.find(looksLikeName) ?? '';
  const { firstName, lastName } = splitName(nameLine);

  return {
    firstName,
    lastName,
    phone,
    email,
    company,
    rawText
  };
}

export async function recognizeAndParseBusinessCard(
  imageUri: string,
  defaultCountry: CountryCode = 'IN'
): Promise<ParsedCard> {
  const result = await TextRecognition.recognize(imageUri);
  return {
    ...parseBusinessCardText(result.text ?? '', defaultCountry),
    imageUri
  };
}
