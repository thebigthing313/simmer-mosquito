export function createRowPayloadMapper<
	TRow extends object,
	TKeys extends readonly (keyof TRow & string)[] = readonly (keyof TRow & string)[],
>(keys: TKeys) {
	return (row: TRow): Pick<TRow, TKeys[number]> => {
		const payload: Partial<Pick<TRow, TKeys[number]>> = {};
		const rowRecord = row as Record<string, unknown>;

		for (const key of keys) {
			payload[key] = rowRecord[key] as Pick<TRow, TKeys[number]>[typeof key];
		}

		return payload as Pick<TRow, TKeys[number]>;
	};
}
