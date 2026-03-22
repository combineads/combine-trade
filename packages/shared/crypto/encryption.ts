/**
 * AES-256-GCM encryption/decryption for exchange API credentials.
 *
 * Uses Web Crypto API (available in Bun) for platform-independent crypto.
 * Each encrypt call generates a unique IV, ensuring ciphertext is never repeated.
 * Output format: base64(iv + ciphertext + authTag)
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 128; // bits

async function deriveKey(masterKey: string): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(masterKey),
		"PBKDF2",
		false,
		["deriveKey"],
	);

	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: encoder.encode("combine-trade-credential-salt"),
			iterations: 100_000,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: ALGORITHM, length: KEY_LENGTH },
		false,
		["encrypt", "decrypt"],
	);
}

/** Encrypt plaintext using AES-256-GCM. Returns base64-encoded string. */
export async function encrypt(plaintext: string, masterKey: string): Promise<string> {
	const key = await deriveKey(masterKey);
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const encoder = new TextEncoder();

	const ciphertext = await crypto.subtle.encrypt(
		{ name: ALGORITHM, iv, tagLength: TAG_LENGTH },
		key,
		encoder.encode(plaintext),
	);

	// Combine iv + ciphertext (includes auth tag) into a single buffer
	const combined = new Uint8Array(iv.length + ciphertext.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(ciphertext), iv.length);

	return btoa(String.fromCharCode(...combined));
}

/** Decrypt a base64-encoded AES-256-GCM ciphertext. */
export async function decrypt(encrypted: string, masterKey: string): Promise<string> {
	const key = await deriveKey(masterKey);
	const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

	const iv = combined.slice(0, IV_LENGTH);
	const ciphertext = combined.slice(IV_LENGTH);

	const plaintext = await crypto.subtle.decrypt(
		{ name: ALGORITHM, iv, tagLength: TAG_LENGTH },
		key,
		ciphertext,
	);

	return new TextDecoder().decode(plaintext);
}
