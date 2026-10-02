import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const INSTALLATION_ID_KEY =
  'drishti.installation.id';

const INSTALLATION_TOKEN_KEY =
  'drishti.installation.token';

export interface InstallationCredentials {
  installationId: string;
  token: string;
}

interface InstallationRegistrationResponse {
  ok?: boolean;
  installationId?: string;
  token?: string;
  code?: string;
  error?: string;
}

function normalizeBaseUrl(
  baseUrl: string,
): string {
  const normalized =
    String(baseUrl || '')
      .trim()
      .replace(/\/+$/, '');

  if (!normalized) {
    throw new Error(
      'Drishti server URL is required.',
    );
  }

  return normalized;
}

async function randomHex(
  bytes: number,
): Promise<string> {
  if (
    !Number.isInteger(bytes) ||
    bytes <= 0
  ) {
    throw new Error(
      'Invalid secure random byte count.',
    );
  }

  const values =
    await Crypto.getRandomBytesAsync(
      bytes,
    );

  if (
    !values ||
    values.length !== bytes
  ) {
    throw new Error(
      'Secure random generation failed.',
    );
  }

  return Array.from(values)
    .map((value) =>
      value
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
}

async function createInstallationId():
  Promise<string> {
  const randomPart =
    await randomHex(16);

  return `install_${randomPart}`;
}

export async function getStoredInstallationId():
  Promise<string | null> {
  const value =
    await SecureStore.getItemAsync(
      INSTALLATION_ID_KEY,
    );

  const normalized =
    String(value || '').trim();

  return normalized || null;
}

export async function getStoredInstallationToken():
  Promise<string | null> {
  const value =
    await SecureStore.getItemAsync(
      INSTALLATION_TOKEN_KEY,
    );

  const normalized =
    String(value || '').trim();

  return normalized || null;
}

export async function getStoredInstallationCredentials():
  Promise<InstallationCredentials | null> {
  const [
    installationId,
    token,
  ] = await Promise.all([
    getStoredInstallationId(),
    getStoredInstallationToken(),
  ]);

  if (
    !installationId ||
    !token
  ) {
    return null;
  }

  return {
    installationId,
    token,
  };
}

export async function ensureInstallationId():
  Promise<string> {
  const existing =
    await getStoredInstallationId();

  if (existing) {
    return existing;
  }

  const installationId =
    await createInstallationId();

  await SecureStore.setItemAsync(
    INSTALLATION_ID_KEY,
    installationId,
  );

  return installationId;
}

export async function storeInstallationToken(
  token: string,
): Promise<void> {
  const normalized =
    String(token || '').trim();

  if (!normalized) {
    throw new Error(
      'Installation token cannot be empty.',
    );
  }

  await SecureStore.setItemAsync(
    INSTALLATION_TOKEN_KEY,
    normalized,
  );
}

export async function storeInstallationCredentials(
  credentials: InstallationCredentials,
): Promise<void> {
  const installationId =
    String(
      credentials.installationId ||
        '',
    ).trim();

  const token =
    String(
      credentials.token || '',
    ).trim();

  if (
    !installationId ||
    !token
  ) {
    throw new Error(
      'Invalid installation credentials.',
    );
  }

  /*
   * Write the token first and installation ID last.
   *
   * This minimizes the chance of leaving a public
   * installation ID without its corresponding secret
   * credential if storage is interrupted.
   */
  await SecureStore.setItemAsync(
    INSTALLATION_TOKEN_KEY,
    token,
  );

  await SecureStore.setItemAsync(
    INSTALLATION_ID_KEY,
    installationId,
  );
}

export async function clearInstallationCredentials():
  Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(
      INSTALLATION_ID_KEY,
    ),

    SecureStore.deleteItemAsync(
      INSTALLATION_TOKEN_KEY,
    ),
  ]);
}

async function registerInstallation(
  serverBaseUrl: string,
  installationId: string,
): Promise<InstallationCredentials> {
  const response =
    await fetch(
      `${normalizeBaseUrl(
        serverBaseUrl,
      )}/api/installations/register`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          installationId,
        }),
      },
    );

  let body:
    InstallationRegistrationResponse;

  try {
    body =
      await response.json();
  } catch {
    throw new Error(
      `Drishti server returned an invalid installation response (${response.status}).`,
    );
  }

  if (!response.ok) {
    /*
     * Never silently rotate an existing installation
     * credential.
     *
     * Knowing an installation ID alone must not allow
     * an existing secret token to be replaced.
     */
    if (
      response.status === 409 &&
      body.code ===
        'INSTALLATION_ALREADY_REGISTERED'
    ) {
      throw new Error(
        'This Drishti installation is already registered, but its secure credential is unavailable on this device. Re-registration requires a controlled installation reset.',
      );
    }

    throw new Error(
      body.error ||
        `Unable to register Drishti installation (${response.status}).`,
    );
  }

  const returnedInstallationId =
    String(
      body.installationId || '',
    ).trim();

  const token =
    String(
      body.token || '',
    ).trim();

  if (
    body.ok !== true ||
    returnedInstallationId !==
      installationId ||
    !token
  ) {
    throw new Error(
      'Drishti server returned invalid installation credentials.',
    );
  }

  return {
    installationId:
      returnedInstallationId,
    token,
  };
}

/*
 * Ensures this physical Drishti installation has
 * server-issued credentials.
 *
 * Existing credentials are always reused.
 *
 * Registration happens only when no token exists.
 */
export async function ensureInstallationRegistered(
  serverBaseUrl: string,
): Promise<InstallationCredentials> {
  const existing =
    await getStoredInstallationCredentials();

  if (existing) {
    return existing;
  }

  const existingId =
    await getStoredInstallationId();

  const existingToken =
    await getStoredInstallationToken();

  /*
   * Token-without-ID should never normally happen.
   *
   * Because such a token cannot safely be associated
   * with an unknown installation, remove it before
   * creating a new registration.
   */
  if (
    existingToken &&
    !existingId
  ) {
    await SecureStore.deleteItemAsync(
      INSTALLATION_TOKEN_KEY,
    );
  }

  /*
   * If an ID exists without a token, preserve the ID.
   *
   * If the ID was never registered, registration
   * succeeds.
   *
   * If the server already owns that ID, it returns
   * 409 instead of disclosing/replacing its token.
   */
  const installationId =
    existingId ||
    (await ensureInstallationId());

  const credentials =
    await registerInstallation(
      serverBaseUrl,
      installationId,
    );

  await storeInstallationCredentials(
    credentials,
  );

  return credentials;
}

/*
 * Creates authentication headers for protected
 * Drishti backend routes.
 *
 * The server must validate the bearer token before
 * trusting x-drishti-installation-id.
 */
export async function createInstallationAuthorizationHeaders(
  serverBaseUrl: string,
): Promise<Record<string, string>> {
  const credentials =
    await ensureInstallationRegistered(
      serverBaseUrl,
    );

  return {
    Authorization:
      `Bearer ${credentials.token}`,

    'x-drishti-installation-id':
      credentials.installationId,
  };
}

/*
 * Temporary compatibility helper for code using the
 * previous singular function name.
 */
export async function createInstallationAuthorizationHeader():
  Promise<Record<string, string>> {
  const credentials =
    await getStoredInstallationCredentials();

  if (!credentials) {
    throw new Error(
      'This Drishti installation has not been registered yet.',
    );
  }

  return {
    Authorization:
      `Bearer ${credentials.token}`,

    'x-drishti-installation-id':
      credentials.installationId,
  };
}