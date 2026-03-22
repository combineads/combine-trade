/** Hash a password using Argon2id via Bun.password. */
export async function hashPassword(plain: string): Promise<string> {
	return Bun.password.hash(plain, { algorithm: "argon2id" });
}

/** Compare a plain password against an Argon2id hash. */
export async function comparePassword(plain: string, hash: string): Promise<boolean> {
	return Bun.password.verify(plain, hash);
}
