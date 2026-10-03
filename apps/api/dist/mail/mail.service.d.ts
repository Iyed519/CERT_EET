import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
export declare class MailService {
    private readonly transporter;
    private readonly configService;
    private readonly logger;
    constructor(transporter: Transporter, configService: ConfigService);
    sendVerificationEmail(to: string, token: string): Promise<void>;
}
