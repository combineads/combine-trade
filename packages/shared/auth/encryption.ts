import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export interface EncryptedData {
	ciphertext: string;
	iv: string;
	tag: string;
}

/** Encrypt plaintext using AES-256-GCM with a random 12-byte IV. */
export function encrypt(plaintext: string, masterKeyHex: string): EncryptedData {
	const key = Buffer.from(masterKeyHex, "hex");
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();

	return {
		ciphertext: encrypted.toString("hex"),
		iv: iv.toString("hex"),
		tag: tag.toString("hex"),
	};
}

/** Decrypt ciphertext using AES-256-GCM. */
export function decrypt(
	ciphertextHex: string,
	ivHex: string,
	tagHex: string,
	masterKeyHex: string,
): string {
	const key = Buffer.from(masterKeyHex, "hex");
	const iv = Buffer.from(ivHex, "hex");
	const ciphertext = Buffer.from(ciphertextHex, "hex");
	const tag = Buffer.from(tagHex, "hex");

	const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
	decipher.setAuthTag(tag);
	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

	return decrypted.toString("utf8");
}

/** Mask an API key: show first 3 chars + "****" + last 4 chars. Keys shorter than 7 chars get fully masked. */
export function maskApiKey(key: string): string {
	if (key.length < 7) {
		return "****";
	}
	return `${key.slice(0, 3)}****${key.slice(-4)}`;
}

export interface StoredCredential {
	id: string;
	exchangeId: string;
	apiKey: string;
	apiKeyIv: string;
	apiKeyTag: string;
	apiSecret: string;
	apiSecretIv: string;
	apiSecretTag: string;
	label: string;
}

export interface CredentialListItem {
	id: string;
	exchangeId: string;
	label: string;
	apiKeyPreview: string;
}

export interface CredentialServiceDeps {
	masterKey: string;
	saveCredential: (data: {
		exchangeId: string;
		apiKey: string;
		apiKeyIv: string;
		apiKeyTag: string;
		apiSecret: string;
		apiSecretIv: string;
		apiSecretTag: string;
		label: string;
		apiKeyPreview: string;
	}) => Promise<void>;
	getCredential: (id: string) => Promise<StoredCredential | null>;
	deleteCredential: (id: string) => Promise<void>;
	listCredentials: () => Promise<CredentialListItem[]>;
}

export class CredentialService {
	constructor(private readonly deps: CredentialServiceDeps) {}

	async save(
		exchangeId: string,
		apiKey: string,
		apiSecret: string,
		label: string,
	): Promise<void> {
		const encKey = encrypt(apiKey, this.deps.masterKey);
		const encSecret = encrypt(apiSecret, this.deps.masterKey);

		await this.deps.saveCredential({
			exchangeId,
			apiKey: encKey.ciphertext,
			apiKeyIv: encKey.iv,
			apiKeyTag: encKey.tag,
			apiSecret: encSecret.ciphertext,
			apiSecretIv: encSecret.iv,
			apiSecretTag: encSecret.tag,
			label,
			apiKeyPreview: maskApiKey(apiKey),
		});
	}

	async get(id: string): Promise<{ apiKey: string; apiSecret: string; exchangeId: string; label: string } | null> {
		const cred = await this.deps.getCredential(id);
		if (!cred) return null;

		return {
			apiKey: decrypt(cred.apiKey, cred.apiKeyIv, cred.apiKeyTag, this.deps.masterKey),
			apiSecret: decrypt(cred.apiSecret, cred.apiSecretIv, cred.apiSecretTag, this.deps.masterKey),
			exchangeId: cred.exchangeId,
			label: cred.label,
		};
	}

	async delete(id: string): Promise<void> {
		await this.deps.deleteCredential(id);
	}

	async list(): Promise<CredentialListItem[]> {
		return this.deps.listCredentials();
	}
}
