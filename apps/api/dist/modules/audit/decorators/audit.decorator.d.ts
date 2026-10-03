import { CustomDecorator } from '@nestjs/common';
export declare const AUDIT_ACTION_KEY = "audit_action";
export declare const Audit: (action: string) => CustomDecorator;
