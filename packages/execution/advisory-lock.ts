export interface AdvisoryLockDeps {
	acquireLock: (key: bigint) => Promise<boolean>;
	releaseLock: (key: bigint) => Promise<void>;
}

/**
 * Generate a 64-bit hash key from symbol + direction.
 * Used as PostgreSQL advisory lock key.
 */
export function hashLockKey(symbol: string, direction: string): bigint {
	const str = `${symbol}:${direction}`;
	let hash = 0n;
	for (let i = 0; i < str.length; i++) {
		const ch = BigInt(str.charCodeAt(i));
		hash = ((hash << 5n) - hash + ch) & 0xffffffffffffffffn;
	}
	return hash;
}

/**
 * Execute a function while holding an advisory lock.
 * Acquires the lock, runs fn, then releases regardless of success/failure.
 * Throws if lock cannot be acquired (timeout).
 */
export async function withAdvisoryLock<T>(
	deps: AdvisoryLockDeps,
	key: bigint,
	fn: () => Promise<T>,
): Promise<T> {
	const acquired = await deps.acquireLock(key);
	if (!acquired) {
		throw new Error(`Failed to acquire advisory lock for key ${key}`);
	}

	try {
		return await fn();
	} finally {
		await deps.releaseLock(key);
	}
}
