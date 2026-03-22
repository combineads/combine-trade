"use client";

import { OrdersView, type OrderRow } from "@combine/ui";
import { useEffect, useState } from "react";

export default function OrdersPage() {
	const [orders, setOrders] = useState<OrderRow[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const pageSize = 20;

	useEffect(() => {
		fetch(`/api/v1/orders?page=${page}&pageSize=${pageSize}`)
			.then((r) => r.json())
			.then((data) => {
				setOrders(data.items ?? []);
				setTotal(data.total ?? 0);
			})
			.catch(() => {});
	}, [page]);

	return (
		<OrdersView
			orders={orders}
			total={total}
			page={page}
			pageSize={pageSize}
			onPageChange={setPage}
		/>
	);
}
