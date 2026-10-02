const fs = require('fs');
const path = require('path');

const {
  Client,
  LocalAuth
} = require('whatsapp-web.js');

const {
  markConnecting,
  markConnected,
  markConnectionError
} = require('./whatsappConnectionService');

/**
 * Runtime registry of PERSONAL WhatsApp clients.
 *
 * Key:
 *   authenticated Drishti userId
 *
 * Value:
 *   {
 *     client,
 *     phoneNumber,
 *     status,
 *     qr,
 *     pairingCode,
 *     initializePromise
 *   }
 *
 * WhatsApp authentication data itself is NOT stored
 * in this Map.
 *
 * LocalAuth persists each user's browser/authentication
 * session in an isolated directory.
 */
const sessions = new Map();

const PERSONAL_AUTH_ROOT =
  process.env.WWEBJS_PERSONAL_AUTH_PATH ||
  path.resolve(
    process.cwd(),
    '.wwebjs_personal_auth'
  );

function safeClientId(userId) {
  const safe = String(userId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);

  if (!safe) {
    throw new Error(
      'A valid Drishti user identity is required.'
    );
  }

  return `drishti-personal-${safe}`;
}

function publicSession(userId) {
  const session = sessions.get(userId);

  if (!session) {
    return {
      status: 'DISCONNECTED',
      qrAvailable: false,
      pairingCodeAvailable: false,
      pairingCode: null
    };
  }

  return {
    status: session.status,
    qrAvailable: Boolean(session.qr),
    pairingCodeAvailable:
      Boolean(session.pairingCode),
    pairingCode:
      session.pairingCode || null
  };
}

function getSession(userId) {
  return sessions.get(userId) || null;
}

function hasPersistedPersonalProfile(userId) {
  const clientId = safeClientId(userId);

  const persistedSessionDir = path.join(
    PERSONAL_AUTH_ROOT,
    `session-${clientId}`
  );

  return fs.existsSync(
    path.join(
      persistedSessionDir,
      'Default'
    )
  );
}

async function createPersonalSession(
  userId,
  phoneNumber
) {
  if (!userId) {
    throw new Error(
      'Drishti user identity is required.'
    );
  }

  const existing = sessions.get(userId);

  if (existing) {
    return publicSession(userId);
  }

  const normalizedPhone = String(
    phoneNumber || ''
  ).replace(/\D/g, '');

  if (!normalizedPhone) {
    const error = new Error(
      'A valid international WhatsApp number is required.'
    );

    error.statusCode = 400;
    error.code = 'INVALID_WHATSAPP_PHONE';

    throw error;
  }

  const clientId = safeClientId(userId);

  const hasPersistedProfile =
    hasPersistedPersonalProfile(userId);

  console.log(
    `[Personal WhatsApp:${userId}] ` +
      (
        hasPersistedProfile
          ? 'RESTORING_PERSISTED_SESSION'
          : 'STARTING_NEW_PAIRING'
      )
  );

  const clientOptions = {
    authStrategy: new LocalAuth({
      clientId,
      dataPath: PERSONAL_AUTH_ROOT
    }),

    puppeteer: {
      headless: true,

      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    }
  };

  /*
   * Only request phone-number pairing when there is
   * no existing LocalAuth profile.
   *
   * If the profile already exists, WhatsApp Web must
   * restore that authenticated session instead.
   */
  if (!hasPersistedProfile) {
    clientOptions.pairWithPhoneNumber = {
      phoneNumber: normalizedPhone,
      showNotification: true,
      intervalMs: 180000
    };
  }

  const client = new Client(
    clientOptions
  );

  const session = {
    client,
    phoneNumber: normalizedPhone,
    status: 'CONNECTING',
    qr: null,
    pairingCode: null,
    initializePromise: null
  };

  sessions.set(
    userId,
    session
  );

  try {
    await markConnecting(userId);
  } catch (error) {
    sessions.delete(userId);

    try {
      await client.destroy();
    } catch (_destroyError) {
      // Nothing else to clean up here.
    }

    throw error;
  }

  client.on('qr', (qr) => {
    console.log(
      `[Personal WhatsApp:${userId}] QR_RECEIVED`
    );

    session.status =
      'PENDING_VERIFICATION';

    session.qr = qr;
    session.pairingCode = null;
  });

  client.on('code', (code) => {
    console.log(
      `[Personal WhatsApp:${userId}] ` +
        'PAIRING_CODE_GENERATED'
    );

    session.status =
      'PENDING_VERIFICATION';

    session.qr = null;
    session.pairingCode = code;
  });

  client.on(
    'authenticated',
    () => {
      console.log(
        `[Personal WhatsApp:${userId}] AUTHENTICATED`
      );

      session.status = 'CONNECTING';
      session.qr = null;
      session.pairingCode = null;
    }
  );

  client.on(
    'ready',
    async () => {
      console.log(
        `[Personal WhatsApp:${userId}] READY`
      );

      session.status = 'CONNECTED';
      session.qr = null;
      session.pairingCode = null;

      try {
        const displayName =
          client.info?.pushname ||
          client.info?.wid?.user ||
          null;

        await markConnected({
          userId,
          displayName
        });
      } catch (error) {
        console.error(
          `[Personal WhatsApp:${userId}] ` +
            'Unable to update connected state:',
          error
        );
      }
    }
  );

  client.on(
    'auth_failure',
    async (message) => {
      console.error(
        `[Personal WhatsApp:${userId}] AUTH_FAILURE:`,
        message
      );

      session.status = 'ERROR';
      session.qr = null;
      session.pairingCode = null;

      try {
        await markConnectionError({
          userId,

          message:
            message ||
            'WhatsApp authentication failed.'
        });
      } catch (error) {
        console.error(
          `[Personal WhatsApp:${userId}] ` +
            'Unable to update auth failure:',
          error
        );
      }
    }
  );

  client.on(
    'disconnected',
    async (reason) => {
      console.error(
        `[Personal WhatsApp:${userId}] DISCONNECTED:`,
        reason
      );

      session.status = 'ERROR';
      session.qr = null;
      session.pairingCode = null;

      try {
        await markConnectionError({
          userId,

          message:
            `WhatsApp disconnected: ${reason}`
        });
      } catch (error) {
        console.error(
          `[Personal WhatsApp:${userId}] ` +
            'Unable to update disconnect state:',
          error
        );
      }
    }
  );

  session.initializePromise =
    client
      .initialize()
      .catch(
        async (error) => {
          session.status = 'ERROR';
          session.qr = null;
          session.pairingCode = null;

          try {
            await markConnectionError({
              userId,

              message:
                error instanceof Error
                  ? error.message
                  : 'WhatsApp initialization failed.'
            });
          } catch (stateError) {
            console.error(
              `[Personal WhatsApp:${userId}] ` +
                'Unable to update initialization failure:',
              stateError
            );
          }

          throw error;
        }
      );

  /*
   * Initialization continues asynchronously.
   *
   * A new WhatsApp connection may wait for pairing,
   * while an existing LocalAuth profile should restore
   * automatically.
   */
  session.initializePromise.catch(
    (error) => {
      console.error(
        `[Personal WhatsApp:${userId}] ` +
          'Initialization failed:',
        error
      );
    }
  );

  return publicSession(userId);
}

function getPersonalSessionState(
  userId
) {
  return publicSession(userId);
}

function getPersonalQr(
  userId
) {
  const session =
    getSession(userId);

  return session?.qr || null;
}

function getPersonalPairingCode(
  userId
) {
  const session =
    getSession(userId);

  return session?.pairingCode || null;
}

async function waitForPersonalSessionReady(
  userId,
  timeoutMs = 30000
) {
  const startedAt = Date.now();

  while (
    Date.now() - startedAt <
    timeoutMs
  ) {
    const session =
      getSession(userId);

    if (
      session &&
      session.status === 'CONNECTED'
    ) {
      return session.client;
    }

    if (
      session &&
      session.status === 'ERROR'
    ) {
      const error = new Error(
        'WhatsApp session recovery failed.'
      );

      error.code =
        'PERSONAL_WHATSAPP_RECOVERY_FAILED';

      throw error;
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          250
        )
    );
  }

  const error = new Error(
    'Timed out waiting for WhatsApp session recovery.'
  );

  error.code =
    'PERSONAL_WHATSAPP_RECOVERY_TIMEOUT';

  throw error;
}

async function recoverPersonalSession(
  userId
) {
  const staleSession =
    getSession(userId);

  if (!staleSession) {
    const error = new Error(
      'Personal WhatsApp session does not exist.'
    );

    error.code =
      'PERSONAL_WHATSAPP_NOT_READY';

    throw error;
  }

  const phoneNumber =
    staleSession.phoneNumber;

  if (!phoneNumber) {
    const error = new Error(
      'Personal WhatsApp session cannot be recovered because its phone number is unavailable.'
    );

    error.code =
      'PERSONAL_WHATSAPP_RECOVERY_PHONE_MISSING';

    throw error;
  }

  console.warn(
    `[Personal WhatsApp:${userId}] ` +
      'RECOVERING_STALE_CLIENT'
  );

  await destroyPersonalSession(
    userId
  );

  await createPersonalSession(
    userId,
    phoneNumber
  );

  return waitForPersonalSessionReady(
    userId
  );
}

function requireReadyPersonalClient(
  userId
) {
  const session =
    getSession(userId);

  if (
    !session ||
    session.status !== 'CONNECTED'
  ) {
    const error = new Error(
      'Personal WhatsApp session is not ready.'
    );

    error.code =
      'PERSONAL_WHATSAPP_NOT_READY';

    throw error;
  }

  return session.client;
}

async function destroyPersonalSession(
  userId
) {
  const session =
    sessions.get(userId);

  if (!session) {
    return;
  }

  sessions.delete(userId);

  try {
    await session.client.destroy();
  } catch (error) {
    console.error(
      `[Personal WhatsApp:${userId}] ` +
        'Destroy failed:',
      error
    );
  }
}

async function destroyAllPersonalSessions() {
  const userIds =
    Array.from(
      sessions.keys()
    );

  await Promise.allSettled(
    userIds.map(
      (userId) =>
        destroyPersonalSession(
          userId
        )
    )
  );
}

/**
 * Reconstruct runtime WhatsApp clients from the
 * persistent Drishti connection registry.
 *
 * This function does NOT create authentication data.
 * Existing LocalAuth profiles are reused by
 * createPersonalSession().
 *
 * Employees without a persisted connection record
 * are not restored.
 */
async function restorePersistedPersonalSessions(
  connections
) {
  const records =
    Array.isArray(connections)
      ? connections
      : [];

  const restorable =
    records.filter(
      (connection) =>
        connection &&
        connection.userId &&
        connection.phoneNumber
    );

  if (
    restorable.length === 0
  ) {
    console.log(
      '[Personal WhatsApp] ' +
        'No persisted sessions to restore.'
    );

    return [];
  }

  console.log(
    `[Personal WhatsApp] Restoring ` +
      `${restorable.length} persisted session(s).`
  );

  const results =
    await Promise.allSettled(
      restorable.map(
        async (connection) => {
          const {
            userId,
            phoneNumber
          } = connection;

          /*
           * A registry entry by itself must never cause
           * a brand-new pairing attempt during startup.
           *
           * Automatic startup restoration is only valid
           * when LocalAuth already exists for this user.
           */
          if (
            !hasPersistedPersonalProfile(
              userId
            )
          ) {
            console.warn(
              `[Personal WhatsApp:${userId}] ` +
                'STARTUP_RESTORE_SKIPPED_NO_LOCAL_AUTH'
            );

            return {
              userId,
              restored: false,
              reason:
                'LOCAL_AUTH_PROFILE_MISSING'
            };
          }

          try {
            await createPersonalSession(
              userId,
              phoneNumber
            );

            return {
              userId,
              restored: true
            };
          } catch (error) {
            console.error(
              `[Personal WhatsApp:${userId}] ` +
                'STARTUP_RESTORE_FAILED:',
              error
            );

            return {
              userId,
              restored: false,

              error:
                error instanceof Error
                  ? error.message
                  : String(error)
            };
          }
        }
      )
    );

  return results;
}

module.exports = {
  createPersonalSession,
  getPersonalSessionState,
  getPersonalQr,
  getPersonalPairingCode,
  requireReadyPersonalClient,
  recoverPersonalSession,
  destroyPersonalSession,
  destroyAllPersonalSessions,
  restorePersistedPersonalSessions
};