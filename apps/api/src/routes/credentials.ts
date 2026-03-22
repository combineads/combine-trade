import { Elysia, t } from "elysia";
import { encrypt } from "../../../../packages/shared/crypto/encryption.js";
import { NotFoundError } from "../lib/errors.js";
import { ok } from "../lib/response.js";

export interface Credential {
	id: string;
	userId: string;
	exchange: string;
	label: string | null;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateCredentialInput {
	exchange: string;
	apiKey: string;
	apiSecret: string;
	label?: string;
}

export interface CredentialRouteDeps {
	masterKey: string;
	findByUserId: (userId: string) => Promise<Credential[]>;
	findById: (id: string) => Promise<Credential | null>;
	create: (input: {
		userId: string;
		exchange: string;
		apiKeyEncrypted: string;
		apiSecretEncrypted: string;
		label: string | null;
	}) => Promise<Credential>;
	update: (id: string, input: { label?: string; isActive?: boolean }) => Promise<Credential>;
	remove: (id: string) => Promise<void>;
}

export function credentialRoutes(deps: CredentialRouteDeps) {
	return new Elysia({ prefix: "/api/v1/credentials" })
		.get("/", async ({ store }) => {
			const userId = (store as Record<string, string>).userId ?? "default-user";
			const creds = await deps.findByUserId(userId);
			return ok(creds);
		})
		.post(
			"/",
			async ({ body, store }) => {
				const userId = (store as Record<string, string>).userId ?? "default-user";
				const [apiKeyEncrypted, apiSecretEncrypted] = await Promise.all([
					encrypt(body.apiKey, deps.masterKey),
					encrypt(body.apiSecret, deps.masterKey),
				]);
				const cred = await deps.create({
					userId,
					exchange: body.exchange,
					apiKeyEncrypted,
					apiSecretEncrypted,
					label: body.label ?? null,
				});
				return ok(cred);
			},
			{
				body: t.Object({
					exchange: t.String(),
					apiKey: t.String(),
					apiSecret: t.String(),
					label: t.Optional(t.String()),
				}),
			},
		)
		.put(
			"/:id",
			async ({ params, body }) => {
				const existing = await deps.findById(params.id);
				if (!existing) throw new NotFoundError(`Credential ${params.id} not found`);
				const updated = await deps.update(params.id, body);
				return ok(updated);
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({
					label: t.Optional(t.String()),
					isActive: t.Optional(t.Boolean()),
				}),
			},
		)
		.delete(
			"/:id",
			async ({ params }) => {
				const existing = await deps.findById(params.id);
				if (!existing) throw new NotFoundError(`Credential ${params.id} not found`);
				await deps.remove(params.id);
				return ok({ deleted: true });
			},
			{
				params: t.Object({ id: t.String() }),
			},
		);
}
