"use client";

import { type AlertRow, AlertsView } from "@combine/ui";
import { useEffect, useState } from "react";

export default function AlertsPage() {
	const [alerts, setAlerts] = useState<AlertRow[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const pageSize = 20;

	useEffect(() => {
		fetch(`/api/v1/alerts?page=${page}&pageSize=${pageSize}`)
			.then((r) => r.json())
			.then((data) => {
				setAlerts(data.items ?? []);
				setTotal(data.total ?? 0);
			})
			.catch(() => {});
	}, [page]);

	return (
		<AlertsView
			alerts={alerts}
			total={total}
			page={page}
			pageSize={pageSize}
			onPageChange={setPage}
		/>
	);
}
