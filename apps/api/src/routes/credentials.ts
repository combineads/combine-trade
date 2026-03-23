import { Elysia, t } from "elysia";
import { encrypt } from "../../../../packages/shared/crypto/encryption.js";
import { NotFoundError, UnauthorizedError } from "../lib/errors.js";
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

/**
 * Extract userId from Elysia context.
 * betterAuthPlugin derives `userId` globally (T-181).
 */
function extractUserId(ctx: Record<string, unknown>): string {
	return typeof ctx.userId === "string" ? ctx.userId : "";
}

export function credentialRoutes(deps: CredentialRouteDeps) {
	return new Elysia({ prefix: "/api/v1/credentials" })
		.get("/", async (ctx) => {
			const userId = extractUserId(ctx as unknown as Record<string, unknown>);
			if (!userId) throw new UnauthorizedError();
			const creds = await deps.findByUserId(userId);
			return ok(creds);
		})
		.post(
			"/",
			async (ctx) => {
				const userId = extractUserId(ctx as unknown as Record<string, unknown>);
				if (!userId) throw new UnauthorizedError();
				const [apiKeyEncrypted, apiSecretEncrypted] = await Promise.all([
					encrypt(ctx.body.apiKey, deps.masterKey),
					encrypt(ctx.body.apiSecret, deps.masterKey),
				]);
				const cred = await deps.create({
					userId,
					exchange: ctx.body.exchange,
					apiKeyEncrypted,
					apiSecretEncrypted,
					label: ctx.body.label ?? null,
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
			async (ctx) => {
				const existing = await deps.findById(ctx.params.id);
				if (!existing) throw new NotFoundError(`Credential ${ctx.params.id} not found`);
				const updated = await deps.update(ctx.params.id, ctx.body);
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
			async (ctx) => {
				const existing = await deps.findById(ctx.params.id);
				if (!existing) throw new NotFoundError(`Credential ${ctx.params.id} not found`);
				await deps.remove(ctx.params.id);
				return ok({ deleted: true });
			},
			{
				params: t.Object({ id: t.String() }),
			},
		);
}
