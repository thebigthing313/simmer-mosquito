/**
 * What a source reduction row reads on the Source Reductions Map's rail and in
 * the Source Reductions Table. Each takes a `SourceReductionListRow`, one row of
 * `/map/source-reduction`.
 */

/** One source reduction as `/map/source-reduction` answers it, cut to what the two surfaces draw. */
export interface SourceReductionListRow {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly sourceReductionMethodId: string;
	readonly sourceReductionDate: string;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: string;
	readonly technicianProfileId: string | null;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
}

/** The method's name, from the catalog the filters read. */
export function sourceReductionMethodName(
	row: SourceReductionListRow,
	methodNameById: ReadonlyMap<string, string>,
): string {
	return methodNameById.get(row.sourceReductionMethodId) ?? 'Unknown method';
}

/** The technician's name, or null for a source reduction recorded with none. */
export function sourceReductionTechnicianName(
	row: SourceReductionListRow,
	personNameById: ReadonlyMap<string, string>,
): string | null {
	return row.technicianProfileId === null
		? null
		: (personNameById.get(row.technicianProfileId) ?? null);
}

/** The habitat ids the rows link, for a bounded read of their names. */
export function linkedHabitatIds(rows: readonly SourceReductionListRow[]): string[] {
	return rows.flatMap((row) => (row.habitatId === null ? [] : [row.habitatId]));
}
