export interface JwtPayload {
	sub: string;
	role: string;
	iat?: number;
	exp?: number;
}

export interface TokenPair {
	accessToken: string;
	refreshToken: string;
}

export interface TokenError {
	status: 401;
	code: "INVALID_TOKEN";
	message: string;
}
