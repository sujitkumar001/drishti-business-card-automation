const {
  CONNECTION_STATUS,
  createConnectionRecord,
  getConnectionByUserId,
  updateConnection,
  removeConnection
} = require('../store/connectionStore');

function normalizePhoneNumber(value) {
  return String(value || '')
    .trim()
    .replace(/[^\d+]/g, '');
}

function publicConnection(connection) {
  if (!connection) {
    return {
      status: CONNECTION_STATUS.DISCONNECTED,
      phoneNumber: '',
      connectionId: ''
    };
  }

  return {
    status: connection.status,
    phoneNumber: connection.phoneNumber,
    connectionId: connection.connectionId,
    displayName: connection.displayName || undefined,
    verifiedAt: connection.verifiedAt || undefined,
    errorMessage: connection.errorMessage || undefined
  };
}

async function beginConnection({
  userId,
  phoneNumber
}) {
  const normalized = normalizePhoneNumber(phoneNumber);

  if (!normalized) {
    throw new Error(
      'A WhatsApp sender number is required.'
    );
  }

  /*
   * IMPORTANT:
   *
   * This creates only the Drishti-side connection record.
   * It does NOT authenticate ownership of the WhatsApp
   * number.
   *
   * The production provider/onboarding integration will
   * initiate the real verification process here.
   */
  const connection = createConnectionRecord({
    userId,
    phoneNumber: normalized
  });

  return publicConnection(connection);
}

async function getConnection(userId) {
  return publicConnection(
    getConnectionByUserId(userId)
  );
}

async function markConnecting(userId) {
  return publicConnection(
    updateConnection(userId, {
      status: CONNECTION_STATUS.CONNECTING,
      errorMessage: null
    })
  );
}

/**
 * This function is intentionally server-internal.
 *
 * Later it must only be called after the WhatsApp
 * provider confirms that this Drishti user actually
 * controls the sender account.
 */
async function markConnected({
  userId,
  displayName
}) {
  return publicConnection(
    updateConnection(userId, {
      status: CONNECTION_STATUS.CONNECTED,
      displayName: displayName || null,
      verifiedAt: new Date().toISOString(),
      errorMessage: null
    })
  );
}

async function markConnectionError({
  userId,
  message
}) {
  return publicConnection(
    updateConnection(userId, {
      status: CONNECTION_STATUS.ERROR,
      errorMessage:
        message || 'WhatsApp connection failed.'
    })
  );
}

async function disconnect(userId) {
  removeConnection(userId);

  return publicConnection(null);
}

async function requireConnectedSender(userId) {
  const connection =
    getConnectionByUserId(userId);

  if (
    !connection ||
    connection.status !== CONNECTION_STATUS.CONNECTED
  ) {
    const error = new Error(
      'A verified WhatsApp connection is required.'
    );

    error.code = 'WHATSAPP_NOT_CONNECTED';

    throw error;
  }

  return connection;
}

module.exports = {
  beginConnection,
  getConnection,
  markConnecting,
  markConnected,
  markConnectionError,
  disconnect,
  requireConnectedSender
};
