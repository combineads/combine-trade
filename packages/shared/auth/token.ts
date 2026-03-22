import { SignJWT, jwtVerify } from "jose";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const ALGORITHM = "HS256";

export interface TokenPayload {
	userId: string;
	type: "access" | "refresh";
	jti?: string;
}

export interface TokenDeps {
	secret: string;
	saveRefreshToken: (jti: string, userId: string, expiresAt: Date) => Promise<void>;
	isRefreshTokenRevoked: (jti: string) => Promise<boolean>;
}

function getSecretKey(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

function generateJti(): string {
	return crypto.randomUUID();
}

/** Sign a short-lived access token (15 min). */
export async function signAccessToken(userId: string, deps: TokenDeps): Promise<string> {
	const key = getSecretKey(deps.secret);
	return new SignJWT({ userId, type: "access" })
		.setProtectedHeader({ alg: ALGORITHM })
		.setIssuedAt()
		.setExpirationTime(ACCESS_TOKEN_EXPIRY)
		.sign(key);
}

/** Sign a long-lived refresh token (7 days). Stored in DB for revocation. */
export async function signRefreshToken(userId: string, deps: TokenDeps): Promise<string> {
	const jti = generateJti();
	const key = getSecretKey(deps.secret);

	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	const token = await new SignJWT({ userId, type: "refresh" })
		.setProtectedHeader({ alg: ALGORITHM })
		.setIssuedAt()
		.setExpirationTime(REFRESH_TOKEN_EXPIRY)
		.setJti(jti)
		.sign(key);

	await deps.saveRefreshToken(jti, userId, expiresAt);

	return token;
}

/** Verify and decode a JWT token. Checks expiry and revocation for refresh tokens. */
export async function verifyToken(token: string, deps: TokenDeps): Promise<TokenPayload> {
	const key = getSecretKey(deps.secret);
	const { payload } = await jwtVerify(token, key, { algorithms: [ALGORITHM] });

	const result: TokenPayload = {
		userId: payload.userId as string,
		type: payload.type as "access" | "refresh",
		jti: payload.jti,
	};

	// Check revocation for refresh tokens
	if (result.type === "refresh" && result.jti) {
		const revoked = await deps.isRefreshTokenRevoked(result.jti);
		if (revoked) {
			throw new Error("Token has been revoked");
		}
	}

	return result;
}
