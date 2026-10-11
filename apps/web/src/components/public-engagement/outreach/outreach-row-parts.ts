/**
 * What an outreach action row reads on the Outreach Actions Map's rail and in
 * the Outreach Actions Table. Each takes an `OutreachListRow`, one row of
 * `/map/outreach`.
 */

/** One outreach action as `/map/outreach` answers it, cut to what the two surfaces draw. */
export interface OutreachListRow {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly outreachMethodId: string;
	readonly outreachDate: string;
	readonly reach: number;
	readonly reachDescription: string | null;
	readonly technicianProfileId: string | null;
	readonly inspectionId: string | null;
}

/** The method's name, from the catalog the filters read. */
export function outreachMethodName(
	row: OutreachListRow,
	methodNameById: ReadonlyMap<string, string>,
): string {
	return methodNameById.get(row.outreachMethodId) ?? 'Unknown method';
}

/** The technician's name, or null for an outreach action recorded with none. */
export function outreachTechnicianName(
	row: OutreachListRow,
	personNameById: ReadonlyMap<string, string>,
): string | null {
	return row.technicianProfileId === null
		? null
		: (personNameById.get(row.technicianProfileId) ?? null);
}
