import { KillSwitchControl } from "./kill-switch-control";
import { LossLimitDisplay, type LossLimitData } from "./loss-limit-display";
import { AuditLog, type AuditEntry } from "./audit-log";

export interface RiskState {
	killSwitchActive: boolean;
	killSwitchReason?: string;
	lossLimit: LossLimitData;
	auditLog: AuditEntry[];
}

export interface RiskManagementViewProps {
	state: RiskState;
	onActivateKillSwitch?: () => void;
	onDeactivateKillSwitch?: () => void;
}

export function RiskManagementView({ state, onActivateKillSwitch, onDeactivateKillSwitch }: RiskManagementViewProps) {
	return (
		<div>
			<h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 24 }}>
				Risk Management
			</h1>

			{/* Kill Switch — topmost, largest element per §11 */}
			<div style={{ marginBottom: 24 }}>
				<KillSwitchControl
					active={state.killSwitchActive}
					reason={state.killSwitchReason}
					onActivate={onActivateKillSwitch}
					onDeactivate={onDeactivateKillSwitch}
				/>
			</div>

			{/* Loss Limit */}
			<div style={{ marginBottom: 24 }}>
				<LossLimitDisplay data={state.lossLimit} />
			</div>

			{/* Audit Log */}
			<AuditLog entries={state.auditLog} />
		</div>
	);
}
