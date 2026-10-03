import { ConfigService } from '@nestjs/config';
import { Profile, Strategy } from 'passport-github2';
import { OauthProfile } from '../auth.types';
declare const GithubStrategy_base: new (...args: [options: import("passport-github2").StrategyOptionsWithRequest] | [options: import("passport-github2").StrategyOptions]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class GithubStrategy extends GithubStrategy_base {
    constructor(configService: ConfigService);
    validate(_accessToken: string, _refreshToken: string, profile: Profile): OauthProfile;
}
export {};
