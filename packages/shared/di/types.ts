/** Unique token for identifying a service in the container */
export interface ServiceToken<T> {
	readonly id: symbol;
	readonly _type?: T; // phantom type for inference
}

/** Factory function that produces a service instance */
export type ServiceFactory<T> = () => T | Promise<T>;

/** Service lifecycle scope */
export const ServiceScope = {
	Singleton: "singleton",
	Transient: "transient",
} as const;

export type ServiceScope = (typeof ServiceScope)[keyof typeof ServiceScope];

/** Creates a typed service token */
export function createToken<T>(name: string): ServiceToken<T> {
	return { id: Symbol(name) };
}
