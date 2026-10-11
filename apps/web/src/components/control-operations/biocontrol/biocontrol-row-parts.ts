/**
 * What a biocontrol action row reads on the Biocontrol Actions Map's rail and
 * in the Biocontrol Actions Table. Each takes a `BiocontrolListRow`, one row of
 * `/map/biocontrol`.
 */

/** One biocontrol action as `/map/biocontrol` answers it, cut to what the two surfaces draw. */
export interface BiocontrolListRow {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly biocontrolMethodId: string;
	readonly biocontrolDate: string;
	readonly amountReleased: number;
	readonly releaseUnitId: string;
	readonly technicianProfileId: string | null;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
}

/** The method's name, from the catalog the filters read. */
export function biocontrolMethodName(
	row: BiocontrolListRow,
	methodNameById: ReadonlyMap<string, string>,
): string {
	return methodNameById.get(row.biocontrolMethodId) ?? 'Unknown method';
}

/** The technician's name, or null for a biocontrol action recorded with none. */
export function biocontrolTechnicianName(
	row: BiocontrolListRow,
	personNameById: ReadonlyMap<string, string>,
): string | null {
	return row.technicianProfileId === null
		? null
		: (personNameById.get(row.technicianProfileId) ?? null);
}

/** The habitat ids the rows link, for a bounded read of their names. */
export function linkedHabitatIds(rows: readonly BiocontrolListRow[]): string[] {
	return rows.flatMap((row) => (row.habitatId === null ? [] : [row.habitatId]));
}
