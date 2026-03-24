"use client";

import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { getTranslations, useTranslations } from "../../i18n";
import type { Locale } from "../../i18n/glossary";

export interface SettingsViewProps {
	theme?: "dark" | "light";
	onThemeChange?: (theme: "dark" | "light") => void;
	onLocaleChange?: (locale: Locale) => void;
	locale?: Locale;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div
			style={{
				backgroundColor: "var(--bg-elevated)",
				borderRadius: "var(--radius-md)",
				padding: 20,
			}}
		>
			<h2
				style={{
					fontSize: 15,
					fontWeight: 600,
					color: "var(--text-primary)",
					margin: "0 0 16px 0",
				}}
			>
				{title}
			</h2>
			{children}
		</div>
	);
}

export function SettingsView({
	theme = "dark",
	onThemeChange,
	onLocaleChange,
	locale,
}: SettingsViewProps) {
	const tContext = useTranslations("settings");
	const t = locale ? getTranslations("settings", locale) : tContext;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
				{t("pageTitle")}
			</h1>

			<Section title={t("sections.appearance")}>
				<div style={{ display: "flex", gap: 8 }}>
					{(["dark", "light"] as const).map((themeOption) => {
						const isActive = themeOption === theme;
						return (
							<button
								key={themeOption}
								type="button"
								onClick={() => onThemeChange?.(themeOption)}
								style={{
									padding: "8px 20px",
									fontSize: 13,
									fontWeight: isActive ? 600 : 400,
									borderRadius: "var(--radius-md)",
									border: "1px solid",
									borderColor: isActive ? "#22C55E" : "var(--border-subtle)",
									backgroundColor: isActive ? "rgba(34,197,94,0.1)" : "transparent",
									color: isActive ? "#22C55E" : "var(--text-secondary)",
									cursor: "pointer",
								}}
							>
								{t(themeOption === "dark" ? "appearance.dark" : "appearance.light")}
							</button>
						);
					})}
				</div>
			</Section>

			<Section title={t("sections.language")}>
				{onLocaleChange ? (
					<LanguageSwitcher onLocaleChange={onLocaleChange} />
				) : (
					<p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
						{t("language")}
					</p>
				)}
			</Section>

			<Section title={t("sections.general")}>
				<p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
					{t("general.comingSoon")}
				</p>
			</Section>

			<Section title={t("sections.exchange")}>
				<p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
					{t("exchange.managedInCredentials")}
				</p>
			</Section>
		</div>
	);
}
