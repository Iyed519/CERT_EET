"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mfaSessionKey = exports.mfaSetupKey = exports.verifyEmailKey = exports.sessionsValidAfterKey = exports.refreshDenylistKey = exports.accessDenylistKey = void 0;
const accessDenylistKey = (jti) => `denylist:access:${jti}`;
exports.accessDenylistKey = accessDenylistKey;
const refreshDenylistKey = (tokenHash) => `denylist:refresh:${tokenHash}`;
exports.refreshDenylistKey = refreshDenylistKey;
const sessionsValidAfterKey = (userId) => `sessions-valid-after:${userId}`;
exports.sessionsValidAfterKey = sessionsValidAfterKey;
const verifyEmailKey = (token) => `verify-email:${token}`;
exports.verifyEmailKey = verifyEmailKey;
const mfaSetupKey = (userId) => `mfa:setup:${userId}`;
exports.mfaSetupKey = mfaSetupKey;
const mfaSessionKey = (mfaToken) => `mfa:${mfaToken}`;
exports.mfaSessionKey = mfaSessionKey;
//# sourceMappingURL=auth.keys.js.map