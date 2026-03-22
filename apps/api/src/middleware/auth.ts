import { Elysia } from "elysia";
import { verifyToken } from "../../../../packages/shared/auth/jwt.js";
import type { JwtPayload } from "../../../../packages/shared/auth/types.js";
import { UnauthorizedError } from "../lib/errors.js";

export interface AuthPluginDeps {
	accessSecret: string;
}

export function authPlugin(deps: AuthPluginDeps) {
	return new Elysia({ name: "auth" })
		.derive({ as: "scoped" }, () => ({ user: null as JwtPayload | null }))
		.onBeforeHandle({ as: "scoped" }, async ({ request, store }) => {
			const header = request.headers.get("authorization");
			if (!header || !header.startsWith("Bearer ")) {
				throw new UnauthorizedError("Missing or invalid authorization header");
			}

			const token = header.slice(7);
			try {
				const payload = await verifyToken(token, deps.accessSecret);
				(store as Record<string, unknown>).user = payload;
			} catch {
				throw new UnauthorizedError("Invalid or expired token");
			}
		})
		.resolve({ as: "scoped" }, ({ store }) => ({
			user: (store as Record<string, unknown>).user as JwtPayload,
		}));
}
