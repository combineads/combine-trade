import StrategyDetailClient from "./client";

// Required for output: 'export' — strategy IDs are unknown at build time.
// Client-side routing resolves the actual ID from params at runtime.
export function generateStaticParams() {
	return [{ params: [] }];
}

export default function StrategyDetailPage() {
	return <StrategyDetailClient />;
}
