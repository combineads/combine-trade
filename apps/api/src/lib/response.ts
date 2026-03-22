/** Wrap a successful response. */
export function ok<T>(data: T): { data: T } {
	return { data };
}

/** Wrap a paginated response. */
export function paginated<T>(
	items: T[],
	total: number,
	page: number,
	pageSize: number,
): { data: T[]; meta: { total: number; page: number; pageSize: number; totalPages: number } } {
	return {
		data: items,
		meta: {
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		},
	};
}
