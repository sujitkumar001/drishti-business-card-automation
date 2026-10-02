const fs = require('fs');
const path = require('path');

const CONNECTION_STATUS = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  ERROR: 'ERROR'
});

const REGISTRY_PATH =
  process.env.DRISHTI_CONNECTION_REGISTRY_PATH ||
  path.resolve(
    process.cwd(),
    '.drishti-data',
    'whatsapp-connections.json'
  );

const connections = new Map();

function ensureRegistryDirectory() {
  fs.mkdirSync(
    path.dirname(REGISTRY_PATH),
    { recursive: true }
  );
}

function cloneConnection(connection) {
  return connection
    ? { ...connection }
    : null;
}

function persistConnections() {
  ensureRegistryDirectory();

  const records = Array.from(
    connections.values()
  );

  const temporaryPath =
    `${REGISTRY_PATH}.tmp`;

  fs.writeFileSync(
    temporaryPath,
    JSON.stringify(records, null, 2),
    'utf8'
  );

  fs.renameSync(
    temporaryPath,
    REGISTRY_PATH
  );
}

function loadConnections() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return;
  }

  try {
    const raw = fs.readFileSync(
      REGISTRY_PATH,
      'utf8'
    );

    if (!raw.trim()) {
      return;
    }

    const records = JSON.parse(raw);

    if (!Array.isArray(records)) {
      throw new Error(
        'Connection registry must contain an array.'
      );
    }

    for (const record of records) {
      if (
        !record ||
        typeof record.userId !== 'string' ||
        !record.userId.trim() ||
        typeof record.phoneNumber !== 'string' ||
        !record.phoneNumber.trim()
      ) {
        console.warn(
          '[ConnectionStore] Ignoring invalid registry record.'
        );
        continue;
      }

      /*
       * CONNECTED is a runtime state.
       * After a process restart the WhatsApp client must
       * actually restore before we claim CONNECTED again.
       */
      connections.set(
        record.userId,
        {
          ...record,
          status:
            record.status === CONNECTION_STATUS.DISCONNECTED
              ? CONNECTION_STATUS.DISCONNECTED
              : CONNECTION_STATUS.CONNECTING,
          errorMessage: null
        }
      );
    }

    console.log(
      `[ConnectionStore] Loaded ${connections.size} persisted connection(s).`
    );
  } catch (error) {
    console.error(
      '[ConnectionStore] Unable to load connection registry:',
      error
    );
  }
}

function createConnectionRecord({
  userId,
  phoneNumber
}) {
  if (!userId) {
    throw new Error('userId is required.');
  }

  if (!phoneNumber) {
    throw new Error('phoneNumber is required.');
  }

  const existing =
    connections.get(userId);

  const now = new Date().toISOString();

  const connection = {
    userId,
    phoneNumber,
    connectionId:
      existing?.connectionId ||
      `wa_${userId}_${Date.now()}`,
    status:
      CONNECTION_STATUS.PENDING_VERIFICATION,
    displayName:
      existing?.displayName || null,
    verifiedAt:
      existing?.verifiedAt || null,
    errorMessage: null,
    createdAt:
      existing?.createdAt || now,
    updatedAt: now
  };

  connections.set(
    userId,
    connection
  );

  persistConnections();

  return cloneConnection(connection);
}

function getConnectionByUserId(userId) {
  return cloneConnection(
    connections.get(userId)
  );
}

function getAllConnections() {
  return Array.from(
    connections.values(),
    cloneConnection
  );
}

function updateConnection(
  userId,
  changes
) {
  const current =
    connections.get(userId);

  if (!current) {
    throw new Error(
      'WhatsApp connection not found.'
    );
  }

  const updated = {
    ...current,
    ...changes,

    userId: current.userId,
    connectionId:
      current.connectionId,

    updatedAt:
      new Date().toISOString()
  };

  connections.set(
    userId,
    updated
  );

  persistConnections();

  return cloneConnection(updated);
}

function removeConnection(userId) {
  const removed =
    connections.delete(userId);

  if (removed) {
    persistConnections();
  }

  return removed;
}

loadConnections();

module.exports = {
  CONNECTION_STATUS,
  REGISTRY_PATH,
  createConnectionRecord,
  getConnectionByUserId,
  getAllConnections,
  updateConnection,
  removeConnection
};