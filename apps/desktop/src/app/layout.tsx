"use client";

import { AuthProviderWrapper } from "@/components/auth-provider-wrapper";
import { LocaleProvider } from "@/providers/LocaleProvider";
import { PlatformProvider, ThemeProvider } from "@combine/ui";
import "./globals.css";

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="ko" data-theme="dark" suppressHydrationWarning>
			<body
				style={{
					margin: 0,
					backgroundColor: "var(--bg-base)",
					color: "var(--text-primary)",
					fontFamily: "var(--font-sans)",
				}}
			>
				<ThemeProvider defaultTheme="dark">
					<LocaleProvider>
						<AuthProviderWrapper>
							<PlatformProvider>{children}</PlatformProvider>
						</AuthProviderWrapper>
					</LocaleProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
