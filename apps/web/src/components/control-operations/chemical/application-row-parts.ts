/**
 * What a chemical application row reads on the Chemical Applications Map's rail
 * and in the Chemical Applications Table. Each takes an `ApplicationListRow`,
 * one row of `/map/chemical`.
 */

/** One application as `/map/chemical` answers it, cut to what the two surfaces draw. */
export interface ApplicationListRow {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly insecticideId: string;
	readonly applicationMethodId: string | null;
	readonly applicationDate: string;
	readonly amountApplied: number;
	readonly applicationUnitId: string;
	readonly habitatId: string | null;
	readonly applicatorProfileId: string | null;
	readonly applicatorName: string | null;
	readonly batchNames: string[];
}

// The applicator + batch fields are newer than some deployed servers; default
// them so a row that predates them can never crash the list/card render.
export function normalizeApplication(row: ApplicationListRow): ApplicationListRow {
	return {
		...row,
		applicatorName: row.applicatorName ?? null,
		batchNames: row.batchNames ?? [],
	};
}

/** The insecticide's trade name, from the catalog the filters read. */
export function insecticideName(
	insecticideId: string,
	insecticideNameById: ReadonlyMap<string, string>,
): string {
	return insecticideNameById.get(insecticideId) ?? 'Unknown insecticide';
}

/** The method's name, or null for an application recorded with none. */
export function applicationMethodName(
	row: ApplicationListRow,
	methodNameById: ReadonlyMap<string, string>,
): string | null {
	return row.applicationMethodId === null
		? null
		: (methodNameById.get(row.applicationMethodId) ?? 'Unknown method');
}
