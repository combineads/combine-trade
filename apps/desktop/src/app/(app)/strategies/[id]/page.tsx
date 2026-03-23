import StrategyDetailClient from "./client";

// Required for output: 'export' — IDs are unknown at build time, so we generate an empty set.
// Client-side routing handles the actual ID from the URL at runtime.
export function generateStaticParams() {
	return [{ id: "_" }];
}

export default function StrategyDetailPage() {
	return <StrategyDetailClient />;
}
