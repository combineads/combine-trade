import Decimal from "decimal.js";

export class BalanceLockError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BalanceLockError";
	}
}

/**
 * In-memory pessimistic balance lock.
 *
 * Exchange adapters call `acquire()` when sizing an order. The reserved amount
 * is deducted from the available balance so subsequent orders cannot
 * over-commit the same funds. Call `release()` when the order is filled,
 * cancelled, or rejected.
 *
 * All monetary amounts are strings (Decimal.js compatible).
 */
export class BalanceLock {
	/** lockId → reserved amount */
	private readonly locks = new Map<string, Decimal>();

	/** Sum of all active reservations. */
	private totalLocked(): Decimal {
		let sum = new Decimal(0);
		for (const amount of this.locks.values()) {
			sum = sum.add(amount);
		}
		return sum;
	}

	/**
	 * Available balance = totalBalance − active reservations.
	 * @param totalBalance Current total balance (string).
	 */
	available(totalBalance: string): string {
		return new Decimal(totalBalance).sub(this.totalLocked()).toFixed();
	}

	/**
	 * Reserve `amount` from `totalBalance` under `lockId`.
	 *
	 * @throws {BalanceLockError} if lockId already exists, or insufficient available balance.
	 */
	acquire(lockId: string, amount: string, totalBalance: string): void {
		if (this.locks.has(lockId)) {
			throw new BalanceLockError(`Lock '${lockId}' already exists`);
		}

		const reserved = new Decimal(amount);
		const avail = new Decimal(totalBalance).sub(this.totalLocked());

		if (reserved.greaterThan(avail)) {
			throw new BalanceLockError(
				`Insufficient available balance: need ${amount}, available ${avail.toFixed()}`,
			);
		}

		this.locks.set(lockId, reserved);
	}

	/**
	 * Release the reservation for `lockId`.
	 * If `lockId` is unknown, this is a silent no-op.
	 */
	release(lockId: string): void {
		this.locks.delete(lockId);
	}

	/** Clear all active locks (useful for cleanup / testing). */
	releaseAll(): void {
		this.locks.clear();
	}

	/**
	 * Return the amount locked under `lockId`, or "0" if not found.
	 */
	lockedAmount(lockId: string): string {
		return (this.locks.get(lockId) ?? new Decimal(0)).toFixed();
	}
}
