"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Audit = exports.AUDIT_ACTION_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.AUDIT_ACTION_KEY = 'audit_action';
const Audit = (action) => (0, common_1.SetMetadata)(exports.AUDIT_ACTION_KEY, action);
exports.Audit = Audit;
//# sourceMappingURL=audit.decorator.js.map