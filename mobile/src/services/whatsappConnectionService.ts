import type {
  WhatsAppConnection,
} from '../types';

import {
  createInstallationAuthorizationHeaders,
} from './installationIdentityService';

export interface WhatsAppRuntimeSession {
  status:
    | 'DISCONNECTED'
    | 'PENDING_VERIFICATION'
    | 'CONNECTING'
    | 'CONNECTED'
    | 'ERROR';
  qrAvailable: boolean;
  pairingCodeAvailable?: boolean;
  pairingCode?: string | null;
}

interface ConnectionResponse {
  ok: boolean;
  connection?: WhatsAppConnection;
  session?: WhatsAppRuntimeSession;
  qr?: string | null;
  pairingCode?: string | null;
  error?: string;
}

export interface WhatsAppConnectionState {
  connection: WhatsAppConnection;
  session: WhatsAppRuntimeSession;
}

export interface WhatsAppQrState
  extends WhatsAppConnectionState {
  qr: string | null;
}

export interface WhatsAppPairingState
  extends WhatsAppConnectionState {
  pairingCode: string;
}


function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

async function parseResponse(
  response: Response,
): Promise<ConnectionResponse> {
  let body: ConnectionResponse;

  try {
    body = await response.json();
  } catch {
    throw new Error(
      `Drishti server returned an invalid response (${response.status}).`,
    );
  }

  if (!response.ok || !body.ok) {
    throw new Error(
      body.error ||
        `Drishti server request failed (${response.status}).`,
    );
  }

  return body;
}

function runtimeSession(
  body: ConnectionResponse,
): WhatsAppRuntimeSession {
  return (
    body.session || {
      status: 'DISCONNECTED',
      qrAvailable: false,
    }
  );
}

function requireConnection(
  body: ConnectionResponse,
): WhatsAppConnection {
  if (!body.connection) {
    throw new Error(
      'Drishti server did not return a WhatsApp connection.',
    );
  }

  return body.connection;
}

async function headers(
  serverBaseUrl: string,
): Promise<Record<string, string>> {
  const authHeaders =
    await createInstallationAuthorizationHeaders(
      normalizeBaseUrl(serverBaseUrl),
    );

  return {
    ...authHeaders,
    'Content-Type': 'application/json',
  };
}

export async function getWhatsAppConnectionState(
  serverBaseUrl: string,
): Promise<WhatsAppConnectionState> {
  const response = await fetch(
    `${normalizeBaseUrl(
      serverBaseUrl,
    )}/api/whatsapp/connection`,
    {
      method: 'GET',
      headers: await headers(serverBaseUrl),
    },
  );

  const body = await parseResponse(response);

  return {
    connection: requireConnection(body),
    session: runtimeSession(body),
  };
}

export async function getWhatsAppQrState(
  serverBaseUrl: string,
): Promise<WhatsAppQrState> {
  const response = await fetch(
    `${normalizeBaseUrl(
      serverBaseUrl,
    )}/api/whatsapp/connection/qr`,
    {
      method: 'GET',
      headers: await headers(serverBaseUrl),
    },
  );

  const body = await parseResponse(response);

  return {
    connection: requireConnection(body),
    session: runtimeSession(body),
    qr: body.qr || null,
  };
}

export async function getWhatsAppConnection(
  serverBaseUrl: string,
): Promise<WhatsAppConnection> {
  const response = await fetch(
    `${normalizeBaseUrl(
      serverBaseUrl,
    )}/api/whatsapp/connection`,
    {
      method: 'GET',
      headers: await headers(serverBaseUrl),
    },
  );

  const body = await parseResponse(response);

  if (!body.connection) {
    throw new Error(
      'Drishti server did not return a WhatsApp connection.',
    );
  }

  return body.connection;
}

export async function beginWhatsAppConnection(
  serverBaseUrl: string,
  phoneNumber: string,
): Promise<WhatsAppConnection> {
  const response = await fetch(
    `${normalizeBaseUrl(
      serverBaseUrl,
    )}/api/whatsapp/connection`,
    {
      method: 'POST',
      headers: await headers(serverBaseUrl),
      body: JSON.stringify({
        phoneNumber,
      }),
    },
  );

  const body = await parseResponse(response);

  if (!body.connection) {
    throw new Error(
      'Drishti server did not return a WhatsApp connection.',
    );
  }

  return body.connection;
}

export async function disconnectWhatsAppConnection(
  serverBaseUrl: string,
): Promise<WhatsAppConnection> {
  const response = await fetch(
    `${normalizeBaseUrl(
      serverBaseUrl,
    )}/api/whatsapp/connection`,
    {
      method: 'DELETE',
      headers: await headers(serverBaseUrl),
    },
  );

  const body = await parseResponse(response);

  if (!body.connection) {
    throw new Error(
      'Drishti server did not return a WhatsApp connection.',
    );
  }

  return body.connection;
}
