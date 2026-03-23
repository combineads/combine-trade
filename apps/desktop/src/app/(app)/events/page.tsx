"use client";

import { type EventRow, EventsView } from "@combine/ui";
import { useEffect, useState } from "react";

export default function EventsPage() {
	const [events, setEvents] = useState<EventRow[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const pageSize = 20;

	useEffect(() => {
		fetch(`/api/v1/events?page=${page}&pageSize=${pageSize}`)
			.then((r) => r.json())
			.then((data) => {
				setEvents(data.items ?? []);
				setTotal(data.total ?? 0);
			})
			.catch(() => {});
	}, [page]);

	return (
		<EventsView
			events={events}
			total={total}
			page={page}
			pageSize={pageSize}
			onPageChange={setPage}
		/>
	);
}
