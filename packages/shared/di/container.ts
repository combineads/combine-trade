import type { ServiceFactory, ServiceScope, ServiceToken } from "./types.js";

interface Registration<T> {
	factory: ServiceFactory<T>;
	scope: ServiceScope;
}

/**
 * Lightweight IoC container with singleton/transient scopes.
 * Supports sync and async factory functions.
 */
export class Container {
	private registrations = new Map<symbol, Registration<unknown>>();
	private singletons = new Map<symbol, unknown>();
	private disposalOrder: symbol[] = [];

	register<T>(
		token: ServiceToken<T>,
		factory: ServiceFactory<T>,
		scope: ServiceScope = "singleton",
	): void {
		this.registrations.set(token.id, { factory, scope });
	}

	async resolve<T>(token: ServiceToken<T>): Promise<T> {
		const registration = this.registrations.get(token.id) as Registration<T> | undefined;
		if (!registration) {
			throw new Error(`Service not registered: ${token.id.toString()}`);
		}

		if (registration.scope === "singleton") {
			if (this.singletons.has(token.id)) {
				return this.singletons.get(token.id) as T;
			}
			const instance = await registration.factory();
			this.singletons.set(token.id, instance);
			this.disposalOrder.push(token.id);
			return instance;
		}

		return await registration.factory();
	}

	has<T>(token: ServiceToken<T>): boolean {
		return this.registrations.has(token.id);
	}

	async dispose(): Promise<void> {
		for (const id of this.disposalOrder.reverse()) {
			const instance = this.singletons.get(id);
			if (instance && typeof (instance as { dispose?: () => unknown }).dispose === "function") {
				await (instance as { dispose: () => unknown }).dispose();
			}
		}
		this.singletons.clear();
		this.disposalOrder = [];
	}
}
