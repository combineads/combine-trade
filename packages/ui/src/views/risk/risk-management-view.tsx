import { getTranslations, useTranslations } from "../../i18n";
import type { Locale } from "../../i18n/glossary";
import { type AuditEntry, AuditLog } from "./audit-log";
import { KillSwitchControl } from "./kill-switch-control";
import { type LossLimitData, LossLimitDisplay } from "./loss-limit-display";

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
	locale?: Locale;
}

export function RiskManagementView({
	state,
	onActivateKillSwitch,
	onDeactivateKillSwitch,
	locale,
}: RiskManagementViewProps) {
	const tContext = useTranslations("risk");
	const t = locale ? getTranslations("risk", locale) : tContext;

	return (
		<div>
			<h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 24 }}>
				{t("pageTitle")}
			</h1>

			{/* Kill Switch — topmost, largest element per §11 */}
			<div style={{ marginBottom: 24 }}>
				<KillSwitchControl
					active={state.killSwitchActive}
					reason={state.killSwitchReason}
					onActivate={onActivateKillSwitch}
					onDeactivate={onDeactivateKillSwitch}
					locale={locale}
				/>
			</div>

			{/* Loss Limit */}
			<div style={{ marginBottom: 24 }}>
				<LossLimitDisplay data={state.lossLimit} locale={locale} />
			</div>

			{/* Audit Log */}
			<AuditLog entries={state.auditLog} locale={locale} />
		</div>
	);
}
