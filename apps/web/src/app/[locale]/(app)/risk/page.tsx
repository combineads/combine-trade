"use client";

import { RiskManagementView, type RiskState } from "@combine/ui";
import { useEffect, useState } from "react";

const defaultState: RiskState = {
	killSwitchActive: false,
	lossLimit: { dailyLimit: 0, dailyUsed: 0, currency: "USD" },
	auditLog: [],
};

export default function RiskPage() {
	const [state, setState] = useState<RiskState>(defaultState);

	useEffect(() => {
		fetch("/api/v1/risk/status")
			.then((r) => r.json())
			.then((data) =>
				setState({
					killSwitchActive: data.killSwitchActive ?? false,
					killSwitchReason: data.killSwitchReason,
					lossLimit: data.lossLimit ?? defaultState.lossLimit,
					auditLog: data.auditLog ?? [],
				}),
			)
			.catch(() => {});
	}, []);

	return (
		<RiskManagementView
			state={state}
			onActivateKillSwitch={() => {
				fetch("/api/v1/risk/kill-switch", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ active: true }),
				})
					.then(() => setState((s) => ({ ...s, killSwitchActive: true })))
					.catch(() => {});
			}}
			onDeactivateKillSwitch={() => {
				fetch("/api/v1/risk/kill-switch", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ active: false }),
				})
					.then(() => setState((s) => ({ ...s, killSwitchActive: false })))
					.catch(() => {});
			}}
		/>
	);
}
