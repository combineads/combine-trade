import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import type { Credential, CredentialRouteDeps } from "../routes/credentials.js";

type Db = PostgresJsDatabase<typeof schema>;

function mapRowToCredential(row: typeof schema.exchangeCredentials.$inferSelect): Credential {
	return {
		id: row.id,
		userId: row.userId,
		exchange: row.exchange,
		label: row.label,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function createCredentialDeps(db: Db, masterKey: string): CredentialRouteDeps {
	return {
		masterKey,

		findByUserId: async (userId: string): Promise<Credential[]> => {
			// exchangeCredentials.userId is uuid, auth userId is text uuid
			// Use sql cast to handle the type mismatch
			const rows = await db
				.select()
				.from(schema.exchangeCredentials)
				.where(sql`${schema.exchangeCredentials.userId}::text = ${userId}`);
			return rows.map(mapRowToCredential);
		},

		findById: async (id: string): Promise<Credential | null> => {
			const rows = await db
				.select()
				.from(schema.exchangeCredentials)
				.where(eq(schema.exchangeCredentials.id, id))
				.limit(1);
			return rows[0] ? mapRowToCredential(rows[0]) : null;
		},

		create: async (input: {
			userId: string;
			exchange: string;
			apiKeyEncrypted: string;
			apiSecretEncrypted: string;
			label: string | null;
		}): Promise<Credential> => {
			const rows = await db
				.insert(schema.exchangeCredentials)
				.values({
					userId: input.userId as unknown as string,
					exchange: input.exchange,
					apiKeyEncrypted: input.apiKeyEncrypted,
					apiSecretEncrypted: input.apiSecretEncrypted,
					label: input.label,
					isActive: true,
				})
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to create credential");
			return mapRowToCredential(row);
		},

		update: async (
			id: string,
			input: { label?: string; isActive?: boolean },
		): Promise<Credential> => {
			const now = new Date();
			const rows = await db
				.update(schema.exchangeCredentials)
				.set({
					...(input.label !== undefined && { label: input.label }),
					...(input.isActive !== undefined && { isActive: input.isActive }),
					updatedAt: now,
				})
				.where(eq(schema.exchangeCredentials.id, id))
				.returning();
			const row = rows[0];
			if (!row) throw new Error(`Credential ${id} not found`);
			return mapRowToCredential(row);
		},

		remove: async (id: string): Promise<void> => {
			await db.delete(schema.exchangeCredentials).where(eq(schema.exchangeCredentials.id, id));
		},
	};
}
