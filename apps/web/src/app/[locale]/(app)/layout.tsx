import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

export default function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
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
	);
}
