import type { TransactionProvider } from "./types.js";

const TX_CONTEXT = Symbol("transactionContext");

/**
 * @Transactional decorator — wraps a method in a database transaction.
 * On success: commits. On error: rolls back and rethrows.
 * Nested calls detect an existing transaction and skip creating a new one.
 */
export function Transactional(provider: TransactionProvider) {
	return (
		_target: unknown,
		_propertyKey: string,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor => {
		const original = descriptor.value;
		descriptor.value = async function (this: Record<symbol, unknown>, ...args: unknown[]) {
			// If already in a transaction, just run the method
			if (this[TX_CONTEXT]) {
				return original.apply(this, args);
			}

			const txCtx = await provider.begin();
			return txCtx.execute(async () => {
				this[TX_CONTEXT] = txCtx;
				try {
					return await original.apply(this, args);
				} finally {
					this[TX_CONTEXT] = undefined;
				}
			});
		};
		return descriptor;
	};
}

/** Symbol key for accessing the transaction context on a service instance */
export { TX_CONTEXT };
