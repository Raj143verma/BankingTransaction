const auditLogModel = require('../models/auditLog.model');

/**
 * Record an append-only audit event for administrative and security-sensitive system operations.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.actor - Authenticated SYSTEM user ID
 * @param {string} params.action - Action identifier enum
 * @param {string} params.resourceType - Affected resource type ('ACCOUNT', 'ACCOUNT_APPLICATION', 'TRANSACTION', 'USER', 'SYSTEM')
 * @param {string|mongoose.Types.ObjectId} [params.resourceId] - Target document ObjectId
 * @param {Object} [params.previousState] - Previous state snapshot
 * @param {Object} [params.newState] - New state snapshot
 * @param {string} [params.reason] - Administrative reason / justification
 * @param {Object} [params.metadata] - Non-sensitive contextual metadata
 * @param {Object} [params.req] - Express request object for automatic IP and User-Agent extraction
 * @param {string} [params.ipAddress] - Optional explicit IP address
 * @param {string} [params.userAgent] - Optional explicit User-Agent string
 * @param {mongoose.ClientSession} [session] - Optional active MongoDB multi-document session
 * @returns {Promise<Object>} Created audit log document
 */
async function logAuditEvent(params, session = null) {
  const {
    actor,
    action,
    resourceType,
    resourceId = null,
    previousState = null,
    newState = null,
    reason = null,
    metadata = {},
    req = null,
    ipAddress: explicitIp = null,
    userAgent: explicitUa = null,
  } = params || {};

  let ipAddress = explicitIp;
  let userAgent = explicitUa;

  if (req) {
    if (!ipAddress) {
      ipAddress =
        req.ip ||
        req.headers['x-forwarded-for'] ||
        req.socket?.remoteAddress ||
        '127.0.0.1';
      if (typeof ipAddress === 'string' && ipAddress.includes(',')) {
        ipAddress = ipAddress.split(',')[0].trim();
      }
    }
    if (!userAgent) {
      userAgent = req.headers['user-agent'] || 'Unknown';
    }
  }

  const doc = {
    actor,
    action,
    resourceType,
    resourceId,
    previousState,
    newState,
    reason: reason ? String(reason).trim() : null,
    metadata: metadata || {},
    ipAddress: ipAddress ? String(ipAddress).slice(0, 100) : null,
    userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
  };

  const createOptions = session ? { session } : {};
  const result = await auditLogModel.create([doc], createOptions);
  return result[0];
}

module.exports = {
  logAuditEvent,
};
