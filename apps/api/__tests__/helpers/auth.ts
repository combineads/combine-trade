import { signAccessToken } from "../../../../packages/shared/auth/jwt.js";

export const TEST_SECRET = "test-secret";

export async function makeAuthHeaders(): Promise<Record<string, string>> {
	const token = await signAccessToken({ sub: "user-1", role: "admin" }, TEST_SECRET);
	return { Authorization: `Bearer ${token}` };
}
