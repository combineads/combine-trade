"use client";

import { SettingsView } from "@combine/ui";
import { useTheme } from "@combine/ui";

export default function SettingsPage() {
	const { theme, setTheme } = useTheme();
	return <SettingsView theme={theme} onThemeChange={setTheme} />;
}
