import { Elysia, t } from "elysia";
import {
	signAccessToken,
	signRefreshToken,
	verifyToken,
} from "../../../../packages/shared/auth/jwt.js";
import { comparePassword } from "../../../../packages/shared/auth/password.js";
import type { JwtPayload, TokenPair } from "../../../../packages/shared/auth/types.js";
import { UnauthorizedError } from "../lib/errors.js";
import { ok } from "../lib/response.js";

export interface UserRecord {
	id: string;
	username: string;
	passwordHash: string;
	role: string;
}

export interface AuthRouteDeps {
	accessSecret: string;
	refreshSecret: string;
	findUserByUsername: (username: string) => Promise<UserRecord | null>;
}

async function generateTokenPair(
	payload: JwtPayload,
	accessSecret: string,
	refreshSecret: string,
): Promise<TokenPair> {
	const [accessToken, refreshToken] = await Promise.all([
		signAccessToken(payload, accessSecret),
		signRefreshToken(payload, refreshSecret),
	]);
	return { accessToken, refreshToken };
}

export function authRoutes(deps: AuthRouteDeps) {
	return new Elysia({ prefix: "/api/v1/auth" })
		.post(
			"/login",
			async ({ body }) => {
				const user = await deps.findUserByUsername(body.username);
				if (!user) throw new UnauthorizedError("Invalid credentials");

				const valid = await comparePassword(body.password, user.passwordHash);
				if (!valid) throw new UnauthorizedError("Invalid credentials");

				const payload: JwtPayload = { sub: user.id, role: user.role };
				const tokens = await generateTokenPair(payload, deps.accessSecret, deps.refreshSecret);
				return ok(tokens);
			},
			{
				body: t.Object({
					username: t.String(),
					password: t.String(),
				}),
			},
		)
		.post(
			"/refresh",
			async ({ body }) => {
				let payload: JwtPayload;
				try {
					payload = await verifyToken(body.refreshToken, deps.refreshSecret);
				} catch {
					throw new UnauthorizedError("Invalid or expired refresh token");
				}

				const tokens = await generateTokenPair(
					{ sub: payload.sub, role: payload.role },
					deps.accessSecret,
					deps.refreshSecret,
				);
				return ok(tokens);
			},
			{
				body: t.Object({
					refreshToken: t.String(),
				}),
			},
		)
		.post("/logout", () => {
			return ok({ message: "Logged out" });
		});
}
