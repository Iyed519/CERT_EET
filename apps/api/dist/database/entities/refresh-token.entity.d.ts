import { User } from './user.entity';
export declare class RefreshToken {
    id: string;
    userId: string;
    user: User;
    familleId: string;
    tokenHash: string;
    adresseIp: string | null;
    userAgent: string | null;
    active: boolean;
    dateExpiration: Date;
    createdAt: Date;
}
