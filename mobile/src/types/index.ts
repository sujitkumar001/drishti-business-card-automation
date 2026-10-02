export type WhatsAppMode =
  | 'DIRECT_LINK'
  | 'AUTOMATED_ENGINE';

export type WhatsAppConnectionStatus =
  | 'DISCONNECTED'
  | 'PENDING_VERIFICATION'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ERROR';

export interface CardContact {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company: string;
  rawText?: string;
  imageUri?: string;
}

export interface WhatsAppConnection {
  status: WhatsAppConnectionStatus;

  /**
   * Sender number displayed to the user.
   * This is informational on the mobile side.
   *
   * The backend must determine the real sender from the
   * authenticated Drishti account rather than trusting
   * this value during message sending.
   */
  phoneNumber: string;

  /**
   * Backend-owned identifier for the verified WhatsApp
   * connection. Empty until a connection exists.
   */
  connectionId: string;

  /**
   * Optional user-facing display name returned by the
   * backend after successful connection.
   */
  displayName?: string;

  /**
   * ISO timestamp supplied by the backend when the
   * connection was last successfully verified.
   */
  verifiedAt?: string;

  /**
   * User-friendly connection error.
   */
  errorMessage?: string;
}

export interface UserSettings {
  greetingTemplate: string;
  greetingSignature: string;
  digitalCardUri: string;
  preferredMode: WhatsAppMode;
  defaultCountry: string;

  /**
   * Kept temporarily for compatibility with the current
   * prototype backend. This will later become an internal
   * Drishti production endpoint rather than an editable
   * setting shown to users.
   */
  serverBaseUrl: string;

  whatsappConnection: WhatsAppConnection;
}

export interface ServerPayload {
  /**
   * Receiver extracted from the scanned business card.
   */
  phone: string;

  name: string;
  customMessage: string;
  mediaUrl?: string;

  /**
   * Intentionally no sender phone number here.
   *
   * The production backend must derive the sender from
   * the authenticated Drishti user and that user's
   * verified WhatsApp connection.
   */
}

export interface ParsedCard extends CardContact {
  rawText: string;
}
