import { User } from './user.entity';
export declare class CompteOauth {
    id: string;
    userId: string;
    user: User;
    provider: string;
    providerId: string;
    email: string | null;
    createdAt: Date;
}
