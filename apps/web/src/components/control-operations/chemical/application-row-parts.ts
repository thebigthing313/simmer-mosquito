/**
 * What a Treatment row reads on the Chemical Applications Map's rail and in the
 * Chemical Applications Table. Each takes a `TreatmentListRow`, one row of
 * `/map/chemical`: one Treatment, with its products in `lines` (ADR 0020).
 */

import { listTreatmentLines } from '../../../lib/list-treatment-lines';
import { formatAmount } from '../control-display';

/** One product a Treatment put out, as `/map/chemical` lists it on the row. */
export interface TreatmentListLine {
	/** The Chemical Application's own id. */
	readonly id: string;
	readonly insecticideId: string;
	readonly amountApplied: number;
	readonly applicationUnitId: string;
	readonly batchNames: readonly string[];
}

/** One Treatment as `/map/chemical` answers it, cut to what the two surfaces draw. */
export interface TreatmentListRow {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly applicationMethodId: string | null;
	readonly applicationDate: string;
	readonly habitatId: string | null;
	readonly applicatorProfileId: string | null;
	readonly applicatorName: string | null;
	/** The live lines, oldest first. A Treatment always holds at least one. */
	readonly lines: readonly TreatmentListLine[];
}

// The applicator and the batch names are newer than some deployed servers;
// default them so a row that predates them can never crash the list or card.
export function normalizeTreatment(row: TreatmentListRow): TreatmentListRow {
	return {
		...row,
		applicatorName: row.applicatorName ?? null,
		lines: (row.lines ?? []).map((line) => ({ ...line, batchNames: line.batchNames ?? [] })),
	};
}

/** The insecticide's trade name, from the catalog the filters read. */
export function insecticideName(
	insecticideId: string,
	insecticideNameById: ReadonlyMap<string, string>,
): string {
	return insecticideNameById.get(insecticideId) ?? 'Unknown insecticide';
}

/** The Treatment's products by trade name, in line order: `Altosid XR-G, VectoBac 12AS`. */
export function treatmentProductNames(
	row: TreatmentListRow,
	insecticideNameById: ReadonlyMap<string, string>,
): string {
	return listTreatmentLines(row.lines, (line) =>
		insecticideName(line.insecticideId, insecticideNameById),
	);
}

/** Each product's amount in its own unit, in the same order as the names: `12 gal, 4 oz`. */
export function treatmentAmounts(
	row: TreatmentListRow,
	unitById: ReadonlyMap<string, { readonly abbreviation: string }>,
): string {
	return listTreatmentLines(row.lines, (line) =>
		formatAmount(line.amountApplied, unitById.get(line.applicationUnitId)),
	);
}

/** Every batch the Treatment drew from, across its lines, once each and by name. */
export function treatmentBatchNames(row: TreatmentListRow): readonly string[] {
	return [...new Set(row.lines.flatMap((line) => line.batchNames))].sort((first, second) =>
		first.localeCompare(second),
	);
}

/** The method's name, or null for a Treatment recorded with none. */
export function applicationMethodName(
	row: TreatmentListRow,
	methodNameById: ReadonlyMap<string, string>,
): string | null {
	return row.applicationMethodId === null
		? null
		: (methodNameById.get(row.applicationMethodId) ?? 'Unknown method');
}
