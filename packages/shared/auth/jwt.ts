import * as jose from "jose";
import type { JwtPayload, TokenError } from "./types.js";

const encoder = new TextEncoder();

function createTokenError(message: string): TokenError {
	return { status: 401, code: "INVALID_TOKEN", message };
}

/** Sign a JWT access token (default expiry: 15m). */
export async function signAccessToken(
	payload: JwtPayload,
	secret: string,
	expiresIn = "15m",
): Promise<string> {
	return new jose.SignJWT({ sub: payload.sub, role: payload.role })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(encoder.encode(secret));
}

/** Sign a JWT refresh token (default expiry: 7d). */
export async function signRefreshToken(
	payload: JwtPayload,
	secret: string,
	expiresIn = "7d",
): Promise<string> {
	return new jose.SignJWT({ sub: payload.sub, role: payload.role, type: "refresh" })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(encoder.encode(secret));
}

/** Verify a JWT token. Throws TokenError on failure. */
export async function verifyToken(token: string, secret: string): Promise<JwtPayload> {
	try {
		const { payload } = await jose.jwtVerify(token, encoder.encode(secret));
		return {
			sub: payload.sub as string,
			role: payload.role as string,
			iat: payload.iat,
			exp: payload.exp,
		};
	} catch {
		throw createTokenError("Token verification failed");
	}
}

/** Decode a JWT without verification. Returns null for invalid tokens. */
export function decodeToken(token: string): JwtPayload | null {
	try {
		const payload = jose.decodeJwt(token);
		return {
			sub: payload.sub as string,
			role: payload.role as string,
			iat: payload.iat,
			exp: payload.exp,
		};
	} catch {
		return null;
	}
}
