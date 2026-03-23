"use client";

import { AuthProviderWrapper } from "@/components/auth-provider-wrapper";
import { PlatformProvider, ThemeProvider } from "@combine/ui";
import "./globals.css";

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" data-theme="dark" suppressHydrationWarning>
			<body
				style={{
					margin: 0,
					backgroundColor: "var(--bg-base)",
					color: "var(--text-primary)",
					fontFamily: "var(--font-sans)",
				}}
			>
				<ThemeProvider defaultTheme="dark">
					<AuthProviderWrapper>
						<PlatformProvider>{children}</PlatformProvider>
					</AuthProviderWrapper>
				</ThemeProvider>
			</body>
		</html>
	);
}
