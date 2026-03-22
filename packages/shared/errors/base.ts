export abstract class BaseError extends Error {
	public readonly code: string;
	public readonly timestamp: Date;

	constructor(code: string, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = this.constructor.name;
		this.code = code;
		this.timestamp = new Date();
	}

	toJSON() {
		return {
			name: this.name,
			code: this.code,
			message: this.message,
			timestamp: this.timestamp.toISOString(),
			stack: this.stack,
		};
	}
}
