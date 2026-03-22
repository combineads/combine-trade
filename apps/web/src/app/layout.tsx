import type { Metadata } from "next";
import { ThemeProvider } from "@combine/ui";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import "./globals.css";

export const metadata: Metadata = {
	title: "Combine Trade",
	description: "Strategy-defined vectorization trading system",
};

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
					<div style={{ display: "flex", height: "100vh" }}>
						<Sidebar />
						<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
							<TopBar />
							<main
								style={{
									flex: 1,
									overflow: "auto",
									padding: "var(--content-padding)",
									maxWidth: "var(--content-max-width)",
								}}
							>
								{children}
							</main>
						</div>
					</div>
				</ThemeProvider>
			</body>
		</html>
	);
}
