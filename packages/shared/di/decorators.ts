import type { Container } from "./container.js";
import type { ServiceScope, ServiceToken } from "./types.js";

/**
 * Marks a class as injectable and registers it with the container.
 * Usage: @Injectable(container, token, scope?)
 */
export function Injectable<T>(
	container: Container,
	token: ServiceToken<T>,
	scope: ServiceScope = "singleton",
) {
	return (target: new () => T) => {
		container.register(token, () => new target(), scope);
	};
}
