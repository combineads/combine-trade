import { describe, expect, test } from "bun:test";
import {
	dailyLossLimits,
	dailyPnlTracking,
	killSwitchEvents,
	killSwitchState,
	orders,
	strategies,
} from "../schema/index.js";

/**
 * Verifies that each target table has a `userId` column in its Drizzle schema,
 * that the column maps to the `user_id` SQL column name, is NOT NULL, has a
 * FK reference to the `user` table (authUser), and has a user_id index.
 *
 * These are pure schema-shape tests — no DB connection required.
 *
 * FK info: stored in `Symbol(drizzle:PgInlineForeignKeys)` on the table object
 * as an array of { reference: () => { columns, foreignColumns, foreignTable } }.
 *
 * Index info: stored in `Symbol(drizzle:ExtraConfigBuilder)` as a function
 * whose source contains the index names.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the PgInlineForeignKeys array from a Drizzle table. */
function getInlineForeignKeys(table: object): Array<{
	reference: () => {
		columns: Array<{ name: string }>;
		foreignColumns: Array<{ name: string }>;
		foreignTable: object;
	};
}> {
	const sym = Object.getOwnPropertySymbols(table).find((s) =>
		s.toString().includes("PgInlineForeignKeys"),
	);
	if (!sym) return [];
	return (table as Record<symbol, unknown>)[sym] as Array<{
		reference: () => {
			columns: Array<{ name: string }>;
			foreignColumns: Array<{ name: string }>;
			foreignTable: object;
		};
	}>;
}

/** Check whether the table has a FK from `columnName` to the `user` table's `id`. */
function hasUserIdFk(table: object): boolean {
	const fks = getInlineForeignKeys(table);
	return fks.some((fk) => {
		const ref = fk.reference();
		const localColName = ref.columns[0]?.name;
		if (localColName !== "user_id") return false;
		const foreignColName = ref.foreignColumns[0]?.name;
		if (foreignColName !== "id") return false;
		// Verify the foreign table is the `user` table
		const nameSym = Object.getOwnPropertySymbols(ref.foreignTable).find((s) =>
			s.toString().includes("drizzle:Name"),
		);
		if (!nameSym) return false;
		const foreignTableName = (ref.foreignTable as Record<symbol, unknown>)[nameSym];
		return foreignTableName === "user";
	});
}

/** Check whether the extra config builder source mentions a user_id index. */
function hasUserIdIndex(table: object): boolean {
	const sym = Object.getOwnPropertySymbols(table).find((s) =>
		s.toString().includes("ExtraConfigBuilder"),
	);
	if (!sym) return false;
	const fn = (table as Record<symbol, unknown>)[sym];
	if (typeof fn !== "function") return false;
	return fn.toString().includes("user_id");
}

// ---------------------------------------------------------------------------
// Tests: column presence
// ---------------------------------------------------------------------------

describe("multiuser schema — userId column presence", () => {
	test("strategies has a userId column", () => {
		expect(strategies.userId).toBeDefined();
	});

	test("orders has a userId column", () => {
		expect(orders.userId).toBeDefined();
	});

	test("killSwitchState has a userId column", () => {
		expect(killSwitchState.userId).toBeDefined();
	});

	test("killSwitchEvents has a userId column", () => {
		expect(killSwitchEvents.userId).toBeDefined();
	});

	test("dailyLossLimits has a userId column", () => {
		expect(dailyLossLimits.userId).toBeDefined();
	});

	test("dailyPnlTracking has a userId column", () => {
		expect(dailyPnlTracking.userId).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Tests: SQL column name mapping
// ---------------------------------------------------------------------------

describe("multiuser schema — userId maps to user_id SQL column", () => {
	test("strategies.userId maps to user_id", () => {
		expect(strategies.userId.name).toBe("user_id");
	});

	test("orders.userId maps to user_id", () => {
		expect(orders.userId.name).toBe("user_id");
	});

	test("killSwitchState.userId maps to user_id", () => {
		expect(killSwitchState.userId.name).toBe("user_id");
	});

	test("killSwitchEvents.userId maps to user_id", () => {
		expect(killSwitchEvents.userId.name).toBe("user_id");
	});

	test("dailyLossLimits.userId maps to user_id", () => {
		expect(dailyLossLimits.userId.name).toBe("user_id");
	});

	test("dailyPnlTracking.userId maps to user_id", () => {
		expect(dailyPnlTracking.userId.name).toBe("user_id");
	});
});

// ---------------------------------------------------------------------------
// Tests: NOT NULL constraint
// ---------------------------------------------------------------------------

describe("multiuser schema — userId is NOT NULL", () => {
	test("strategies.userId is notNull", () => {
		expect(strategies.userId.notNull).toBe(true);
	});

	test("orders.userId is notNull", () => {
		expect(orders.userId.notNull).toBe(true);
	});

	test("killSwitchState.userId is notNull", () => {
		expect(killSwitchState.userId.notNull).toBe(true);
	});

	test("killSwitchEvents.userId is notNull", () => {
		expect(killSwitchEvents.userId.notNull).toBe(true);
	});

	test("dailyLossLimits.userId is notNull", () => {
		expect(dailyLossLimits.userId.notNull).toBe(true);
	});

	test("dailyPnlTracking.userId is notNull", () => {
		expect(dailyPnlTracking.userId.notNull).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Tests: FK references authUser (user table)
// ---------------------------------------------------------------------------

describe("multiuser schema — userId references authUser (user table)", () => {
	test("strategies.userId references user.id", () => {
		expect(hasUserIdFk(strategies)).toBe(true);
	});

	test("orders.userId references user.id", () => {
		expect(hasUserIdFk(orders)).toBe(true);
	});

	test("killSwitchState.userId references user.id", () => {
		expect(hasUserIdFk(killSwitchState)).toBe(true);
	});

	test("killSwitchEvents.userId references user.id", () => {
		expect(hasUserIdFk(killSwitchEvents)).toBe(true);
	});

	test("dailyLossLimits.userId references user.id", () => {
		expect(hasUserIdFk(dailyLossLimits)).toBe(true);
	});

	test("dailyPnlTracking.userId references user.id", () => {
		expect(hasUserIdFk(dailyPnlTracking)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Tests: user_id index exists
// ---------------------------------------------------------------------------

describe("multiuser schema — user_id index exists", () => {
	test("strategies has a user_id index", () => {
		expect(hasUserIdIndex(strategies)).toBe(true);
	});

	test("orders has a user_id index", () => {
		expect(hasUserIdIndex(orders)).toBe(true);
	});

	test("killSwitchState has a user_id index", () => {
		expect(hasUserIdIndex(killSwitchState)).toBe(true);
	});

	test("killSwitchEvents has a user_id index", () => {
		expect(hasUserIdIndex(killSwitchEvents)).toBe(true);
	});

	test("dailyLossLimits has a user_id index", () => {
		expect(hasUserIdIndex(dailyLossLimits)).toBe(true);
	});

	test("dailyPnlTracking has a user_id index", () => {
		expect(hasUserIdIndex(dailyPnlTracking)).toBe(true);
	});
});
