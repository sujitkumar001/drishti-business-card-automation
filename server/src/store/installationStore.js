const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INSTALLATION_REGISTRY_PATH =
  process.env.DRISHTI_INSTALLATION_REGISTRY_PATH ||
  path.resolve(
    process.cwd(),
    '.drishti-data',
    'installations.json'
  );

/*
 * lastSeenAt is operational metadata, not security
 * state. Persist it at most once per installation
 * during this interval.
 */
const LAST_SEEN_PERSIST_INTERVAL_MS =
  5 * 60 * 1000;

const installations = new Map();

function ensureRegistryDirectory() {
  fs.mkdirSync(
    path.dirname(INSTALLATION_REGISTRY_PATH),
    {
      recursive: true
    }
  );
}

function cloneInstallation(
  installation
) {
  return installation
    ? { ...installation }
    : null;
}

function persistInstallations() {
  ensureRegistryDirectory();

  const records =
    Array.from(
      installations.values()
    );

  const temporaryPath =
    `${INSTALLATION_REGISTRY_PATH}.tmp`;

  fs.writeFileSync(
    temporaryPath,
    JSON.stringify(
      records,
      null,
      2
    ),
    'utf8'
  );

  /*
   * The temporary file is completely written before
   * replacing the active registry.
   */
  if (
    fs.existsSync(
      INSTALLATION_REGISTRY_PATH
    )
  ) {
    fs.unlinkSync(
      INSTALLATION_REGISTRY_PATH
    );
  }

  fs.renameSync(
    temporaryPath,
    INSTALLATION_REGISTRY_PATH
  );
}

function loadInstallations() {
  if (
    !fs.existsSync(
      INSTALLATION_REGISTRY_PATH
    )
  ) {
    return;
  }

  try {
    const raw =
      fs.readFileSync(
        INSTALLATION_REGISTRY_PATH,
        'utf8'
      );

    if (!raw.trim()) {
      return;
    }

    const records =
      JSON.parse(raw);

    if (!Array.isArray(records)) {
      throw new Error(
        'Installation registry must contain an array.'
      );
    }

    for (const record of records) {
      if (
        !record ||
        typeof record.installationId !==
          'string' ||
        !record.installationId.trim() ||
        typeof record.tokenHash !==
          'string' ||
        !record.tokenHash.trim()
      ) {
        console.warn(
          '[InstallationStore] ' +
            'Ignoring invalid installation record.'
        );

        continue;
      }

      const installationId =
        record.installationId.trim();

      const tokenHash =
        record.tokenHash.trim();

      /*
       * A SHA-256 token hash must be exactly
       * 64 hexadecimal characters.
       */
      if (
        !/^[a-f0-9]{64}$/i.test(
          tokenHash
        )
      ) {
        console.warn(
          '[InstallationStore] ' +
            `Ignoring installation ${installationId} ` +
            'because its token hash is invalid.'
        );

        continue;
      }

      installations.set(
        installationId,
        {
          ...record,
          installationId,
          tokenHash:
            tokenHash.toLowerCase()
        }
      );
    }

    console.log(
      `[InstallationStore] Loaded ` +
        `${installations.size} installation(s).`
    );
  } catch (error) {
    console.error(
      '[InstallationStore] ' +
        'Unable to load installation registry:',
      error
    );
  }
}

function normalizeInstallationId(
  value
) {
  const installationId =
    String(value || '').trim();

  if (
    !/^install_[a-f0-9]{32}$/.test(
      installationId
    )
  ) {
    const error =
      new Error(
        'Invalid Drishti installation identity.'
      );

    error.statusCode = 400;
    error.code =
      'INVALID_INSTALLATION_ID';

    throw error;
  }

  return installationId;
}

function hashInstallationToken(
  token
) {
  return crypto
    .createHash('sha256')
    .update(
      String(token || ''),
      'utf8'
    )
    .digest('hex');
}

function createSecretToken() {
  return crypto
    .randomBytes(32)
    .toString('base64url');
}

function registerInstallation(
  requestedInstallationId
) {
  const installationId =
    normalizeInstallationId(
      requestedInstallationId
    );

  const existing =
    installations.get(
      installationId
    );

  /*
   * Registration is not a credential-recovery
   * endpoint.
   *
   * Knowing the public installation ID must never be
   * enough to obtain or replace its secret token.
   */
  if (existing) {
    const error =
      new Error(
        'This Drishti installation is already registered.'
      );

    error.statusCode = 409;
    error.code =
      'INSTALLATION_ALREADY_REGISTERED';

    throw error;
  }

  const token =
    createSecretToken();

  const now =
    new Date().toISOString();

  const record = {
    installationId,

    tokenHash:
      hashInstallationToken(
        token
      ),

    status: 'ACTIVE',

    createdAt: now,
    updatedAt: now,
    lastSeenAt: null
  };

  installations.set(
    installationId,
    record
  );

  try {
    persistInstallations();
  } catch (error) {
    installations.delete(
      installationId
    );

    throw error;
  }

  /*
   * The raw token is returned only to the registration
   * caller. It is never stored in the registry.
   */
  return {
    installationId,
    token
  };
}

function getInstallation(
  installationId
) {
  return cloneInstallation(
    installations.get(
      installationId
    )
  );
}

function getAllInstallations() {
  return Array.from(
    installations.values(),
    cloneInstallation
  );
}

function verifyInstallationToken(
  installationId,
  token
) {
  const normalizedId =
    normalizeInstallationId(
      installationId
    );

  const suppliedToken =
    String(token || '').trim();

  if (!suppliedToken) {
    return false;
  }

  const installation =
    installations.get(
      normalizedId
    );

  if (
    !installation ||
    installation.status !==
      'ACTIVE'
  ) {
    return false;
  }

  const suppliedHash =
    hashInstallationToken(
      suppliedToken
    );

  const expectedBuffer =
    Buffer.from(
      installation.tokenHash,
      'hex'
    );

  const suppliedBuffer =
    Buffer.from(
      suppliedHash,
      'hex'
    );

  if (
    expectedBuffer.length !==
    suppliedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    suppliedBuffer
  );
}

function shouldPersistLastSeen(
  installation,
  nowMs
) {
  if (!installation.lastSeenAt) {
    return true;
  }

  const previousMs =
    Date.parse(
      installation.lastSeenAt
    );

  if (
    !Number.isFinite(
      previousMs
    )
  ) {
    return true;
  }

  return (
    nowMs - previousMs >=
    LAST_SEEN_PERSIST_INTERVAL_MS
  );
}

function markInstallationSeen(
  installationId
) {
  const normalizedId =
    normalizeInstallationId(
      installationId
    );

  const installation =
    installations.get(
      normalizedId
    );

  if (!installation) {
    return null;
  }

  const nowMs =
    Date.now();

  /*
   * Do not rewrite the persistent registry for every
   * authenticated request.
   *
   * Settings polling may occur every few seconds.
   * Authentication is still verified on every request;
   * only lastSeenAt persistence is throttled.
   */
  if (
    !shouldPersistLastSeen(
      installation,
      nowMs
    )
  ) {
    return cloneInstallation(
      installation
    );
  }

  const now =
    new Date(
      nowMs
    ).toISOString();

  const updated = {
    ...installation,
    lastSeenAt: now,
    updatedAt: now
  };

  installations.set(
    normalizedId,
    updated
  );

  try {
    persistInstallations();
  } catch (error) {
    /*
     * Restore the previous in-memory record if
     * persistence fails.
     */
    installations.set(
      normalizedId,
      installation
    );

    throw error;
  }

  return cloneInstallation(
    updated
  );
}

function revokeInstallation(
  installationId
) {
  const normalizedId =
    normalizeInstallationId(
      installationId
    );

  const installation =
    installations.get(
      normalizedId
    );

  if (!installation) {
    return false;
  }

  const updated = {
    ...installation,

    status: 'REVOKED',

    updatedAt:
      new Date().toISOString()
  };

  installations.set(
    normalizedId,
    updated
  );

  try {
    persistInstallations();
  } catch (error) {
    installations.set(
      normalizedId,
      installation
    );

    throw error;
  }

  return true;
}

loadInstallations();

module.exports = {
  INSTALLATION_REGISTRY_PATH,
  LAST_SEEN_PERSIST_INTERVAL_MS,

  registerInstallation,
  getInstallation,
  getAllInstallations,

  verifyInstallationToken,
  markInstallationSeen,
  revokeInstallation
};