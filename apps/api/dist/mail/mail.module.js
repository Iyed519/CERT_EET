"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = require("nodemailer");
const mail_constants_1 = require("./mail.constants");
const mail_service_1 = require("./mail.service");
let MailModule = class MailModule {
};
exports.MailModule = MailModule;
exports.MailModule = MailModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: mail_constants_1.MAIL_TRANSPORTER,
                inject: [config_1.ConfigService],
                useFactory: (configService) => {
                    const { host, port } = configService.getOrThrow('mail');
                    const logger = new common_1.Logger('MailTransporter');
                    const transporter = nodemailer.createTransport({
                        host,
                        port,
                        secure: false,
                    });
                    logger.log(`Transporteur SMTP configuré (${host}:${port})`);
                    return transporter;
                },
            },
            mail_service_1.MailService,
        ],
        exports: [mail_service_1.MailService],
    })
], MailModule);
//# sourceMappingURL=mail.module.js.map