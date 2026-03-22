const MAX_PAYLOAD_BYTES = 7900; // PostgreSQL NOTIFY limit ~8000 bytes, leave margin

/** Serialize a payload to a JSON string for NOTIFY */
export function serialize<T>(payload: T): string {
	const json = JSON.stringify(payload);
	const bytes = new TextEncoder().encode(json).length;
	if (bytes > MAX_PAYLOAD_BYTES) {
		throw new Error(
			`Event payload exceeds PostgreSQL NOTIFY limit: ${bytes} bytes (max ${MAX_PAYLOAD_BYTES})`,
		);
	}
	return json;
}

/** Deserialize a JSON string from a NOTIFY payload */
export function deserialize<T>(raw: string): T {
	try {
		return JSON.parse(raw) as T;
	} catch {
		throw new Error(`Failed to deserialize event payload: ${raw.slice(0, 100)}`);
	}
}
