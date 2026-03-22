import type { TokenPayload } from "./token.js";

export interface AuthUser {
	id: string;
	email: string;
	passwordHash: string;
}

export interface AuthServiceDeps {
	findUserByEmail: (email: string) => Promise<AuthUser | null>;
	comparePassword: (plain: string, hash: string) => Promise<boolean>;
	signAccessToken: (userId: string) => Promise<string>;
	signRefreshToken: (userId: string) => Promise<string>;
	verifyRefreshToken: (token: string) => Promise<TokenPayload>;
	revokeRefreshToken: (jti: string) => Promise<void>;
}

export type LoginResult =
	| { ok: true; accessToken: string; refreshToken: string }
	| { ok: false; error: "invalid_credentials" };

export type RefreshResult =
	| { ok: true; accessToken: string }
	| { ok: false; error: "invalid_token" };

export type LogoutResult = { ok: true } | { ok: false; error: "invalid_token" };

export class AuthService {
	constructor(private readonly deps: AuthServiceDeps) {}

	async login(email: string, password: string): Promise<LoginResult> {
		const user = await this.deps.findUserByEmail(email);
		if (!user) {
			return { ok: false, error: "invalid_credentials" };
		}

		const valid = await this.deps.comparePassword(password, user.passwordHash);
		if (!valid) {
			return { ok: false, error: "invalid_credentials" };
		}

		const [accessToken, refreshToken] = await Promise.all([
			this.deps.signAccessToken(user.id),
			this.deps.signRefreshToken(user.id),
		]);

		return { ok: true, accessToken, refreshToken };
	}

	async refresh(refreshToken: string): Promise<RefreshResult> {
		let payload: TokenPayload;
		try {
			payload = await this.deps.verifyRefreshToken(refreshToken);
		} catch {
			return { ok: false, error: "invalid_token" };
		}

		const accessToken = await this.deps.signAccessToken(payload.userId);
		return { ok: true, accessToken };
	}

	async logout(refreshToken: string): Promise<LogoutResult> {
		let payload: TokenPayload;
		try {
			payload = await this.deps.verifyRefreshToken(refreshToken);
		} catch {
			return { ok: false, error: "invalid_token" };
		}

		if (!payload.jti) {
			return { ok: false, error: "invalid_token" };
		}

		await this.deps.revokeRefreshToken(payload.jti);
		return { ok: true };
	}
}
