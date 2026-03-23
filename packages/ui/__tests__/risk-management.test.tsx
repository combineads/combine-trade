import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { ConfirmationDialog } from "../src/components/confirmation-dialog";
import { type AuditEntry, AuditLog } from "../src/views/risk/audit-log";
import { KillSwitchControl } from "../src/views/risk/kill-switch-control";
import { type LossLimitData, LossLimitDisplay } from "../src/views/risk/loss-limit-display";
import { RiskManagementView, type RiskState } from "../src/views/risk/risk-management-view";

describe("LossLimitDisplay", () => {
	test("renders green progress for low usage", () => {
		const data: LossLimitData = { dailyLimit: 5000, dailyUsed: 1000, currency: "USD" };
		const html = renderToString(<LossLimitDisplay data={data} />);
		expect(html).toContain("1,000");
		expect(html).toContain("5,000");
		expect(html).toContain("#22C55E"); // green for 20%
	});

	test("renders amber progress for medium usage", () => {
		const data: LossLimitData = { dailyLimit: 5000, dailyUsed: 3500, currency: "USD" };
		const html = renderToString(<LossLimitDisplay data={data} />);
		expect(html).toContain("#F59E0B"); // amber for 70%
	});

	test("renders red progress for high usage", () => {
		const data: LossLimitData = { dailyLimit: 5000, dailyUsed: 4500, currency: "USD" };
		const html = renderToString(<LossLimitDisplay data={data} />);
		expect(html).toContain("#EF4444"); // red for 90%
	});
});

describe("AuditLog", () => {
	const entries: AuditEntry[] = [
		{
			id: "1",
			action: "kill_switch_activated",
			reason: "Daily loss limit breached",
			actor: "system",
			timestamp: "2026-03-22T10:00:00Z",
		},
		{
			id: "2",
			action: "kill_switch_deactivated",
			reason: "Manual release",
			actor: "user",
			timestamp: "2026-03-22T11:00:00Z",
		},
	];

	test("renders audit entries", () => {
		const html = renderToString(<AuditLog entries={entries} />);
		expect(html).toContain("kill_switch_activated");
		expect(html).toContain("Daily loss limit breached");
	});

	test("renders actor", () => {
		const html = renderToString(<AuditLog entries={entries} />);
		expect(html).toContain("system");
		expect(html).toContain("user");
	});

	test("renders empty state", () => {
		const html = renderToString(<AuditLog entries={[]} />);
		expect(html).toContain("No audit");
	});
});

describe("ConfirmationDialog", () => {
	test("renders title and message", () => {
		const html = renderToString(
			<ConfirmationDialog
				open={true}
				title="Activate Kill Switch"
				message="This will halt all trading immediately."
				confirmLabel="Activate"
				onConfirm={() => {}}
				onCancel={() => {}}
			/>,
		);
		expect(html).toContain("Activate Kill Switch");
		expect(html).toContain("halt all trading");
	});

	test("renders confirm and cancel buttons", () => {
		const html = renderToString(
			<ConfirmationDialog
				open={true}
				title="Confirm"
				message="Are you sure?"
				confirmLabel="Yes"
				onConfirm={() => {}}
				onCancel={() => {}}
			/>,
		);
		expect(html).toContain("Yes");
		expect(html).toContain("Cancel");
	});

	test("renders nothing when closed", () => {
		const html = renderToString(
			<ConfirmationDialog
				open={false}
				title="Confirm"
				message="Are you sure?"
				confirmLabel="Yes"
				onConfirm={() => {}}
				onCancel={() => {}}
			/>,
		);
		expect(html).not.toContain("Confirm");
	});
});

describe("KillSwitchControl", () => {
	test("renders active state", () => {
		const html = renderToString(
			<KillSwitchControl active={true} reason="Daily loss limit breached" />,
		);
		expect(html).toContain("ALL TRADING HALTED");
		expect(html).toContain("Daily loss limit breached");
	});

	test("renders inactive state", () => {
		const html = renderToString(<KillSwitchControl active={false} />);
		expect(html).toContain("Trading Active");
		expect(html).toContain("Activate Kill Switch");
	});

	test("shows keyboard shortcut hint", () => {
		const html = renderToString(<KillSwitchControl active={false} />);
		expect(html).toContain("Ctrl+Shift+K");
	});
});

describe("RiskManagementView", () => {
	const state: RiskState = {
		killSwitchActive: false,
		lossLimit: { dailyLimit: 5000, dailyUsed: 1200, currency: "USD" },
		auditLog: [
			{
				id: "1",
				action: "kill_switch_tested",
				reason: "Manual test",
				actor: "user",
				timestamp: "2026-03-22T09:00:00Z",
			},
		],
	};

	test("renders heading", () => {
		const html = renderToString(<RiskManagementView state={state} />);
		expect(html).toContain("Risk Management");
	});

	test("renders kill switch control", () => {
		const html = renderToString(<RiskManagementView state={state} />);
		expect(html).toContain("Trading Active");
	});

	test("renders loss limit", () => {
		const html = renderToString(<RiskManagementView state={state} />);
		expect(html).toContain("1,200");
		expect(html).toContain("5,000");
	});

	test("renders audit log", () => {
		const html = renderToString(<RiskManagementView state={state} />);
		expect(html).toContain("kill_switch_tested");
	});
});
