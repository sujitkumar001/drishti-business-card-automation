const express = require('express');
const cors = require('cors');
const { MessageMedia } = require('whatsapp-web.js');

const {
  getAllConnections
} = require('./src/store/connectionStore');

const {
  registerInstallation,
  verifyInstallationToken,
  markInstallationSeen
} = require('./src/store/installationStore');

const {
  beginConnection,
  getConnection,
  disconnect,
  requireConnectedSender
} = require('./src/services/whatsappConnectionService');

const {
  createPersonalSession,
  getPersonalSessionState,
  getPersonalQr,
  getPersonalPairingCode,
  requireReadyPersonalClient,
  recoverPersonalSession,
  destroyPersonalSession,
  destroyAllPersonalSessions,
  restorePersistedPersonalSessions
} = require('./src/services/personalWhatsAppSessionManager');

const PORT = Number(
  process.env.PORT || 3000
);

const API_KEY =
  process.env.API_KEY || '';

const app = express();

app.disable('x-powered-by');

app.use(cors());

app.use(
  express.json({
    limit: '256kb'
  })
);

/*
 * ------------------------------------------------------
 * LEGACY API KEY
 * ------------------------------------------------------
 *
 * Development compatibility only.
 *
 * Installation authentication is being introduced
 * separately below. The existing API-key behavior is
 * retained during migration so the currently working
 * Drishti/WhatsApp flow is not disturbed.
 */

function requireApiKey(
  req,
  res,
  next
) {
  if (!API_KEY) {
    return next();
  }

  if (
    req.get('x-api-key') !==
    API_KEY
  ) {
    return res
      .status(401)
      .json({
        ok: false,
        error: 'Unauthorized.'
      });
  }

  next();
}

/*
 * ------------------------------------------------------
 * INSTALLATION AUTHENTICATION
 * ------------------------------------------------------
 */

function getBearerToken(req) {
  const authorization =
    String(
      req.get('authorization') || ''
    ).trim();

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i
    );

  if (!match) {
    return '';
  }

  return match[1].trim();
}

function requireInstallationAuth(
  req,
  res,
  next
) {
  try {
    const installationId =
      String(
        req.get(
          'x-drishti-installation-id'
        ) || ''
      ).trim();

    const token =
      getBearerToken(req);

    if (
      !installationId ||
      !token
    ) {
      return res
        .status(401)
        .json({
          ok: false,
          code:
            'INSTALLATION_AUTH_REQUIRED',
          error:
            'Drishti installation authentication is required.'
        });
    }

    const valid =
      verifyInstallationToken(
        installationId,
        token
      );

    if (!valid) {
      return res
        .status(401)
        .json({
          ok: false,
          code:
            'INVALID_INSTALLATION_CREDENTIALS',
          error:
            'Invalid Drishti installation credentials.'
        });
    }

    /*
     * This identity becomes trusted only AFTER the
     * server verifies the secret installation token.
     */
    req.drishtiInstallationId =
      installationId;

    /*
     * lastSeenAt is operational metadata.
     *
     * A metadata persistence problem should not turn
     * an otherwise valid authentication request into
     * an authentication failure.
     */
    try {
      markInstallationSeen(
        installationId
      );
    } catch (error) {
      console.error(
        '[installation:last-seen]',
        error
      );
    }

    next();
  } catch (error) {
    console.error(
      '[installation:auth]',
      error
    );

    return res
      .status(
        error?.statusCode || 401
      )
      .json({
        ok: false,
        code:
          error?.code ||
          'INSTALLATION_AUTH_FAILED',
        error:
          'Invalid Drishti installation credentials.'
      });
  }
}

/*
 * ------------------------------------------------------
 * COMMON HELPERS
 * ------------------------------------------------------
 */

function normalizePhoneForWhatsApp(
  value
) {
  const digits =
    String(value || '')
      .replace(/\D/g, '');

  if (
    digits.length < 8 ||
    digits.length > 15
  ) {
    throw new Error(
      'Invalid phone number.'
    );
  }

  return `${digits}@c.us`;
}

function isHttpUrl(value) {
  try {
    const url =
      new URL(value);

    return (
      url.protocol === 'http:' ||
      url.protocol === 'https:'
    );
  } catch {
    return false;
  }
}

function isRecoverableWhatsAppPageError(
  error
) {
  const message =
    String(
      error instanceof Error
        ? error.message
        : error || ''
    ).toLowerCase();

  return (
    message.includes(
      'detached frame'
    ) ||
    message.includes(
      'execution context was destroyed'
    ) ||
    message.includes(
      'cannot find context with specified id'
    ) ||
    message.includes(
      'target closed'
    ) ||
    message.includes(
      'session closed'
    )
  );
}

/*
 * ------------------------------------------------------
 * HEALTH
 * ------------------------------------------------------
 */

app.get(
  '/health',
  (_req, res) => {
    res.json({
      ok: true,
      service:
        'drishti-whatsapp-engine'
    });
  }
);

/*
 * ------------------------------------------------------
 * INSTALLATION REGISTRATION
 * ------------------------------------------------------
 *
 * First-launch registration.
 *
 * The mobile app creates a random public
 * installationId.
 *
 * The server generates the secret credential.
 *
 * installationStore persists only the token hash.
 * The raw token is returned exactly once here.
 */

app.post(
  '/api/installations/register',
  requireApiKey,
  (req, res) => {
    try {
      const installationId =
        String(
          req.body
            ?.installationId ||
            ''
        ).trim();

      if (!installationId) {
        return res
          .status(400)
          .json({
            ok: false,
            code:
              'INSTALLATION_ID_REQUIRED',
            error:
              'installationId is required.'
          });
      }

      const credentials =
        registerInstallation(
          installationId
        );

      return res
        .status(201)
        .json({
          ok: true,
          installationId:
            credentials.installationId,
          token:
            credentials.token
        });
    } catch (error) {
      console.error(
        '[installation:register]',
        error
      );

      return res
        .status(
          error?.statusCode || 500
        )
        .json({
          ok: false,
          code:
            error?.code ||
            'INSTALLATION_REGISTRATION_FAILED',
          error:
            error instanceof Error
              ? error.message
              : 'Unable to register Drishti installation.'
        });
    }
  }
);

/*
 * Temporary installation-authentication validation
 * endpoint.
 *
 * This endpoint lets us prove registration and token
 * verification before changing any working WhatsApp
 * route.
 *
 * It will be removed after migration is complete.
 */

app.get(
  '/api/installations/me',
  requireApiKey,
  requireInstallationAuth,
  (req, res) => {
    return res.json({
      ok: true,
      installationId:
        req.drishtiInstallationId
    });
  }
);

/*
 * ------------------------------------------------------
 * GET WHATSAPP CONNECTION STATE
 * ------------------------------------------------------
 */

app.get(
  '/api/whatsapp/connection',
  requireApiKey,
  requireInstallationAuth,
  async (req, res) => {
    try {
      const userId =
        req.drishtiInstallationId;

      const connection =
        await getConnection(
          userId
        );

      const session =
        getPersonalSessionState(
          userId
        );

      return res.json({
        ok: true,
        connection,
        session
      });
    } catch (error) {
      console.error(
        '[whatsapp-connection:get]',
        error
      );

      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          ok: false,

          error:
            error.message ||
            'Unable to get WhatsApp connection.'
        });
    }
  }
);

/*
 * ------------------------------------------------------
 * START / RESTORE WHATSAPP CONNECTION
 * ------------------------------------------------------
 */

app.post(
  '/api/whatsapp/connection',
  requireApiKey,
  requireInstallationAuth,
  async (req, res) => {
    try {
      const userId =
        req.drishtiInstallationId;

      const phoneNumber =
        String(
          req.body
            ?.phoneNumber ||
            ''
        ).trim();

      if (!phoneNumber) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              'WhatsApp sender number is required.'
          });
      }

      /*
       * Creates or refreshes the Drishti-side
       * persistent connection record.
       */
      await beginConnection({
        userId,
        phoneNumber
      });

      /*
       * Starts a new WhatsApp pairing only if no
       * LocalAuth profile exists.
       *
       * Otherwise the existing authenticated
       * profile is restored.
       */
      const session =
        await createPersonalSession(
          userId,
          phoneNumber
        );

      return res
        .status(201)
        .json({
          ok: true,

          connection:
            await getConnection(
              userId
            ),

          session
        });
    } catch (error) {
      console.error(
        '[whatsapp-connection:create]',
        error
      );

      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          ok: false,

          error:
            error.message ||
            'Unable to start WhatsApp connection.'
        });
    }
  }
);

/*
 * ------------------------------------------------------
 * GET QR / PAIRING STATE
 * ------------------------------------------------------
 */

app.get(
  '/api/whatsapp/connection/qr',
  requireApiKey,
  requireInstallationAuth,
  async (req, res) => {
    try {
      const userId =
        req.drishtiInstallationId;

      const connection =
        await getConnection(
          userId
        );

      if (
        !connection ||
        connection.status ===
          'DISCONNECTED'
      ) {
        return res
          .status(404)
          .json({
            ok: false,

            error:
              'No personal WhatsApp connection has been started.'
          });
      }

      const session =
        getPersonalSessionState(
          userId
        );

      const qr =
        getPersonalQr(
          userId
        );

      return res.json({
        ok: true,
        connection,
        session,
        qr: qr || null
      });
    } catch (error) {
      console.error(
        '[whatsapp-connection:qr]',
        error
      );

      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          ok: false,

          error:
            error.message ||
            'Unable to get WhatsApp QR state.'
        });
    }
  }
);

/*
 * ------------------------------------------------------
 * MANUAL DISCONNECT
 * ------------------------------------------------------
 *
 * This is the intentional disconnect path.
 *
 * It:
 *   1. Stops the runtime WhatsApp client.
 *   2. Removes the Drishti persistent connection record.
 *
 * Therefore this employee will NOT be automatically
 * restored after the next server restart.
 *
 * The LocalAuth profile itself is not deleted here.
 */

app.delete(
  '/api/whatsapp/connection',
  requireApiKey,
  requireInstallationAuth,
  async (req, res) => {
    try {
      const userId =
        req.drishtiInstallationId;

      await destroyPersonalSession(
        userId
      );

      const connection =
        await disconnect(
          userId
        );

      return res.json({
        ok: true,
        connection,

        session:
          getPersonalSessionState(
            userId
          )
      });
    } catch (error) {
      console.error(
        '[whatsapp-connection:delete]',
        error
      );

      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          ok: false,

          error:
            error.message ||
            'Unable to disconnect WhatsApp.'
        });
    }
  }
);

/*
 * ------------------------------------------------------
 * SEND GREETING
 * ------------------------------------------------------
 */

app.post(
  '/api/send-greeting',
  requireApiKey,
  requireInstallationAuth,
  async (req, res) => {
    try {
      const userId =
        req.drishtiInstallationId;

      const {
        phone,
        customMessage,
        mediaUrl
      } = req.body || {};

      if (
        !phone ||
        !customMessage ||
        typeof customMessage !==
          'string'
      ) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              'phone and customMessage are required.'
          });
      }

      if (
        customMessage.length >
        4000
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              'Message is too long.'
          });
      }

      /*
       * Validate media before any WhatsApp send
       * occurs so an invalid media URL cannot cause
       * a partial text-only send.
       */
      if (
        mediaUrl &&
        !isHttpUrl(mediaUrl)
      ) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              'mediaUrl must be an HTTP(S) URL reachable by the server.'
          });
      }

      const chatId =
        normalizePhoneForWhatsApp(
          phone
        );

      const destinationNumber =
        chatId.replace(
          '@c.us',
          ''
        );

      let personalClient =
        requireReadyPersonalClient(
          userId
        );

      let numberId;

      /*
       * First validate that the recipient exists
       * on WhatsApp.
       *
       * If Puppeteer/WhatsApp Web has a stale
       * execution frame, recover the employee's
       * authenticated runtime client and retry
       * ONLY this lookup.
       *
       * sendMessage itself is deliberately not
       * automatically retried to prevent duplicate
       * greetings.
       */
      try {
        numberId =
          await personalClient
            .getNumberId(
              destinationNumber
            );
      } catch (error) {
        if (
          !isRecoverableWhatsAppPageError(
            error
          )
        ) {
          throw error;
        }

        console.warn(
          `[send-greeting:${userId}] ` +
            'STALE_WHATSAPP_CLIENT_DURING_NUMBER_LOOKUP'
        );

        personalClient =
          await recoverPersonalSession(
            userId
          );

        numberId =
          await personalClient
            .getNumberId(
              destinationNumber
            );
      }

      if (!numberId) {
        return res
          .status(404)
          .json({
            ok: false,

            error:
              'The destination number is not registered on WhatsApp.'
          });
      }

      /*
       * Prepare optional media before sending
       * the greeting.
       */
      let media = null;

      if (mediaUrl) {
        media =
          await MessageMedia.fromUrl(
            mediaUrl,
            {
              unsafeMime: false
            }
          );
      }

      /*
       * IMPORTANT:
       *
       * No automatic retry is performed after
       * sendMessage begins.
       *
       * This prevents duplicate greeting delivery
       * when delivery state is uncertain.
       */
      await personalClient
        .sendMessage(
          numberId._serialized,
          customMessage
        );

      if (media) {
        await personalClient
          .sendMessage(
            numberId._serialized,
            media
          );
      }

      return res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        '[send-greeting]',
        error
      );

      if (
        error?.code ===
          'WHATSAPP_NOT_CONNECTED' ||
        error?.code ===
          'PERSONAL_WHATSAPP_NOT_READY' ||
        error?.code ===
          'PERSONAL_WHATSAPP_RECOVERY_FAILED' ||
        error?.code ===
          'PERSONAL_WHATSAPP_RECOVERY_TIMEOUT' ||
        error?.code ===
          'PERSONAL_WHATSAPP_RECOVERY_PHONE_MISSING'
      ) {
        return res
          .status(409)
          .json({
            ok: false,
            code: error.code,
            error:
              error.message
          });
      }

      return res
        .status(
          error?.statusCode ||
            500
        )
        .json({
          ok: false,

          error:
            error instanceof Error
              ? error.message
              : 'Unexpected server error.'
        });
    }
  }
);

/*
 * Unknown route.
 */

app.use(
  (_req, res) =>
    res
      .status(404)
      .json({
        ok: false,
        error: 'Not found.'
      })
);

/*
 * ------------------------------------------------------
 * SERVER STARTUP
 * ------------------------------------------------------
 *
 * connectionStore loads the persistent registry when
 * the module is imported.
 *
 * Once HTTP is listening, recreate runtime WhatsApp
 * clients for registered employees.
 *
 * restorePersistedPersonalSessions() will only restore
 * employees whose LocalAuth profile already exists.
 * It will not initiate new pairing during startup.
 */

const server =
  app.listen(
    PORT,
    '0.0.0.0',
    async () => {
      console.log(
        `[HTTP] Listening on http://0.0.0.0:${PORT}`
      );

      try {
        const persistedConnections =
          getAllConnections();

        await restorePersistedPersonalSessions(
          persistedConnections
        );
      } catch (error) {
        /*
         * HTTP stays available even if WhatsApp
         * restoration has a problem.
         */
        console.error(
          '[System] WhatsApp startup restoration failed:',
          error
        );
      }
    }
  );

/*
 * ------------------------------------------------------
 * GRACEFUL SHUTDOWN
 * ------------------------------------------------------
 *
 * Destroying runtime clients here does NOT remove
 * persistent Drishti connection records.
 *
 * Therefore a normal process/server restart can restore
 * authenticated employees automatically.
 */

async function shutdown(signal) {
  console.log(
    `[System] ${signal} received. Shutting down...`
  );

  server.close();

  try {
    await destroyAllPersonalSessions();
  } catch (error) {
    console.error(
      '[System] Personal WhatsApp shutdown error:',
      error
    );
  }

  process.exit(0);
}

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);