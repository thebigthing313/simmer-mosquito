/**
 * The Treatment writer: one visit's insecticide work and the Chemical
 * Applications under it, in one transaction per request (ADR 0020).
 *
 * The header is the Treatment row. The lines and their batch links are written
 * by `treatment-lines.ts` as a diff against what is stored, and the recipe
 * check in `treatment-recipe.ts` runs once per request, after every command in
 * it, through {@link settleTreatmentWrites}. That is what lets one PATCH change
 * the mix amount and revise the lines to match.
 */

import {
	applyRecordDeletion,
	assertWriteReferences,
	type CatalogReference,
	checkedValues,
} from '@simmer-mosquito/db';
import type {
	ControlOperationsCommand,
	RecordTreatmentCommand,
	RecordTreatmentForMissionItemCommand,
	TreatmentApplicationRow,
	TreatmentFieldDetailsChanges,
} from '@simmer-mosquito/domain';
import { returnColumns } from '../../return-columns.js';
import {
	assertMissionGeometryCovered,
	beginMissionExecution,
	defaultMissionMethodId,
	finishMissionExecution,
	missionItemGeom,
} from '../mission-dispatch/mission-execution.js';
import {
	type ControlOperationsTransaction,
	contextIds,
	localDateColumn,
	locationContextColumns,
	resolveGeom,
	softDelete,
	type TreatmentRow,
	updateActionRow,
} from './shared.js';
import { writeTreatmentLines } from './treatment-lines.js';
import { assertTreatmentRecipe } from './treatment-recipe.js';

/** Plus the mission helper, which writes a Treatment and closes the stop. */
export type TreatmentCommand = ControlOperationsCommand | RecordTreatmentForMissionItemCommand;

/**
 * The catalogs a Treatment's header names.
 *
 * Only the keys present are gated, so an edit that moves the date asks nothing
 * of the catalogs, and one that moves the method asks only about that. The
 * Insecticides and batches are the lines' and are gated there.
 */
function treatmentCatalogReferences(source: {
	readonly applicationMethodId?: string | null | undefined;
	readonly vehicleId?: string | null | undefined;
	readonly equipmentId?: string | null | undefined;
	readonly formulationId?: string | null | undefined;
}): CatalogReference[] {
	const references: CatalogReference[] = [];
	if ('applicationMethodId' in source) {
		references.push({
			column: 'application_method_id',
			catalog: 'applicationMethod',
			id: source.applicationMethodId ?? null,
			label: 'application method',
		});
	}
	if ('vehicleId' in source) {
		references.push({
			column: 'vehicle_id',
			catalog: 'vehicle',
			id: source.vehicleId ?? null,
			label: 'vehicle',
		});
	}
	if ('equipmentId' in source) {
		references.push({
			column: 'equipment_id',
			catalog: 'equipment',
			id: source.equipmentId ?? null,
			label: 'equipment record',
		});
	}
	if ('formulationId' in source) {
		references.push({
			column: 'formulation_id',
			catalog: 'formulation',
			id: source.formulationId ?? null,
			label: 'formulation',
		});
	}
	return references;
}

// ---------------------------------------------------------------------------
// The recipe check, settled once per request
// ---------------------------------------------------------------------------

/**
 * The Treatments a request changed in a way the recipe check compares, keyed
 * by transaction so two requests never see each other's.
 *
 * The value is the order the client sent the lines in, or null when the write
 * that asked sent none.
 */
const pendingRecipeChecks = new WeakMap<
	ControlOperationsTransaction,
	Map<string, { readonly organizationId: string; lineOrder: readonly string[] | null }>
>();

function markRecipeCheck(
	trx: ControlOperationsTransaction,
	organizationId: string,
	treatmentId: string,
	lines: readonly TreatmentApplicationRow[] | null,
): void {
	const pending = pendingRecipeChecks.get(trx) ?? new Map();
	pendingRecipeChecks.set(trx, pending);
	const lineOrder = lines === null ? null : lines.map((line) => line.id);
	const existing = pending.get(treatmentId);
	if (existing === undefined) {
		pending.set(treatmentId, { organizationId, lineOrder });
	} else if (lineOrder !== null) {
		existing.lineOrder = lineOrder;
	}
}

/**
 * Run the recipe check for every Treatment the request asked it of.
 *
 * The table's `settle` hook: it runs once after the last command, inside the
 * transaction, so the header and the lines it reads are the ones the whole
 * request left behind.
 */
export async function settleTreatmentWrites(trx: ControlOperationsTransaction): Promise<void> {
	const pending = pendingRecipeChecks.get(trx);
	if (pending === undefined) {
		return;
	}
	pendingRecipeChecks.delete(trx);
	for (const [treatmentId, check] of pending) {
		await assertTreatmentRecipe(trx, {
			treatmentId,
			organizationId: check.organizationId,
			lineOrder: check.lineOrder,
		});
	}
}

// ---------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------

async function insertTreatmentLines(
	trx: ControlOperationsTransaction,
	payload: RecordTreatmentCommand['payload'] | RecordTreatmentForMissionItemCommand['payload'],
): Promise<void> {
	await writeTreatmentLines(trx, {
		treatmentId: payload.treatmentId,
		organizationId: payload.organizationId,
		actorProfileId: payload.actorProfileId,
		lines: payload.applications,
	});
	markRecipeCheck(trx, payload.organizationId, payload.treatmentId, payload.applications);
}

async function recordTreatment(
	trx: ControlOperationsTransaction,
	payload: RecordTreatmentCommand['payload'],
): Promise<TreatmentRow> {
	await assertWriteReferences(trx, {
		organizationId: payload.organizationId,
		write: { kind: 'create' },
		references: treatmentCatalogReferences(payload),
	});
	const ids = contextIds(payload.context);
	const row = await trx
		.insertInto('treatments')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.treatmentId,
				organization_id: payload.organizationId,
				application_date: localDateColumn(payload.applicationDate),
				applicator_profile_id: payload.applicatorProfileId,
				application_method_id: payload.applicationMethodId,
				vehicle_id: payload.vehicleId,
				equipment_id: payload.equipmentId,
				address_id: payload.addressId,
				habitat_id: ids.habitatId,
				inspection_id: ids.inspectionId,
				collection_id: ids.collectionId,
				requested_control_action_id: payload.requestedControlActionId,
				formulation_id: payload.formulationId,
				mix_amount: payload.mixAmount,
				mix_unit_id: payload.mixUnitId,
				geom: await resolveGeom(trx, payload.organizationId, payload.locationSource),
				metadata: payload.metadata,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(returnColumns.treatments)
		.executeTakeFirstOrThrow();
	await insertTreatmentLines(trx, payload);
	return row;
}

/**
 * A Treatment recorded off a mission stop. The stop's geometry and the
 * mission's planned method are the defaults, the coverage check reads the
 * Treatment's own geometry, and the stop completes once for the Treatment
 * however many lines it holds.
 */
async function recordMissionTreatment(
	trx: ControlOperationsTransaction,
	payload: RecordTreatmentForMissionItemCommand['payload'],
): Promise<TreatmentRow> {
	const stop = await beginMissionExecution(trx, payload, 'chemicalApplication');
	await assertWriteReferences(trx, {
		organizationId: payload.organizationId,
		write: { kind: 'create' },
		references: treatmentCatalogReferences(payload),
	});
	const ids = contextIds(payload.context ?? { kind: 'none' });
	const row = await trx
		.insertInto('treatments')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.treatmentId,
				organization_id: payload.organizationId,
				application_date: localDateColumn(payload.applicationDate),
				applicator_profile_id: payload.applicatorProfileId,
				// The plan's method is not a new choice, so only the payload's own
				// id was gated above.
				application_method_id: defaultMissionMethodId(payload.applicationMethodId, stop),
				vehicle_id: payload.vehicleId,
				equipment_id: payload.equipmentId,
				address_id: payload.addressId ?? null,
				habitat_id: ids.habitatId,
				inspection_id: ids.inspectionId,
				collection_id: ids.collectionId,
				requested_control_action_id: stop.requestedControlActionId,
				mission_item_id: payload.missionItemId,
				formulation_id: payload.formulationId,
				mix_amount: payload.mixAmount,
				mix_unit_id: payload.mixUnitId,
				geom: missionItemGeom(payload.missionItemId, payload.geometry),
				metadata: payload.metadata,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(returnColumns.treatments)
		.executeTakeFirstOrThrow();
	await insertTreatmentLines(trx, payload);
	await assertMissionGeometryCovered(trx, payload, payload.treatmentId, 'treatments');
	await finishMissionExecution(trx, payload, stop);
	return row;
}

/** Whether the edit moves the stored Formulation set, which the recipe check compares. */
async function changesFormulation(
	trx: ControlOperationsTransaction,
	treatmentId: string,
	organizationId: string,
	changes: TreatmentFieldDetailsChanges,
): Promise<boolean> {
	if (changes.formulationId === undefined) {
		return false;
	}
	const stored = await trx
		.selectFrom('treatments')
		.select(['formulation_id', 'mix_amount', 'mix_unit_id'])
		.where('id', '=', treatmentId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return (
		stored === undefined ||
		stored.formulation_id !== changes.formulationId ||
		stored.mix_amount !== changes.mixAmount ||
		stored.mix_unit_id !== changes.mixUnitId
	);
}

/** The header columns `updateTreatmentFieldDetails` takes as they are, by change key. */
const FIELD_DETAIL_COLUMNS = [
	['applicatorProfileId', 'applicator_profile_id'],
	['applicationMethodId', 'application_method_id'],
	['vehicleId', 'vehicle_id'],
	['equipmentId', 'equipment_id'],
	['metadata', 'metadata'],
] as const;

/**
 * The patch a field-details edit writes. A key the edit did not name is left
 * out, so the stored value stays; the Formulation set is written whole.
 */
function fieldDetailsColumns(changes: TreatmentFieldDetailsChanges): Record<string, unknown> {
	const columns: Record<string, unknown> = {};
	if (changes.applicationDate !== undefined) {
		columns.application_date = localDateColumn(changes.applicationDate);
	}
	for (const [key, column] of FIELD_DETAIL_COLUMNS) {
		if (key in changes) {
			columns[column] = changes[key] ?? null;
		}
	}
	if (changes.formulationId !== undefined) {
		columns.formulation_id = changes.formulationId;
		columns.mix_amount = changes.mixAmount;
		columns.mix_unit_id = changes.mixUnitId;
	}
	return columns;
}

async function updateTreatmentFieldDetails(
	trx: ControlOperationsTransaction,
	payload: Extract<
		ControlOperationsCommand,
		{ readonly type: 'controlOperations.updateTreatmentFieldDetails' }
	>['payload'],
): Promise<TreatmentRow | null> {
	const { changes, treatmentId, organizationId } = payload;
	await assertWriteReferences(trx, {
		organizationId,
		write: { kind: 'update', table: 'treatments', recordId: treatmentId },
		references: treatmentCatalogReferences(changes),
	});
	const recipeMoved = await changesFormulation(trx, treatmentId, organizationId, changes);
	const row = await updateActionRow(
		trx,
		'treatments',
		treatmentId,
		organizationId,
		{ ...fieldDetailsColumns(changes), updated_by_profile_id: payload.actorProfileId },
		returnColumns.treatments,
	);
	if (row !== null && recipeMoved) {
		markRecipeCheck(trx, organizationId, treatmentId, null);
	}
	return row;
}

async function reviseTreatmentLines(
	trx: ControlOperationsTransaction,
	payload: Extract<
		ControlOperationsCommand,
		{ readonly type: 'controlOperations.reviseTreatmentLines' }
	>['payload'],
): Promise<TreatmentRow | null> {
	// Read first: the line writes name the Treatment, and a missing or foreign
	// one is a 404 rather than a foreign-key error.
	const row = await updateActionRow(
		trx,
		'treatments',
		payload.treatmentId,
		payload.organizationId,
		{ updated_by_profile_id: payload.actorProfileId },
		returnColumns.treatments,
	);
	if (row === null) {
		return null;
	}
	const recipeMoved = await writeTreatmentLines(trx, {
		treatmentId: payload.treatmentId,
		organizationId: payload.organizationId,
		actorProfileId: payload.actorProfileId,
		lines: payload.applications,
	});
	if (recipeMoved) {
		markRecipeCheck(trx, payload.organizationId, payload.treatmentId, payload.applications);
	}
	return row;
}

export async function writeTreatmentCommand(
	trx: ControlOperationsTransaction,
	command: TreatmentCommand,
): Promise<TreatmentRow | null> {
	switch (command.type) {
		case 'controlOperations.recordTreatment':
			return recordTreatment(trx, command.payload);
		case 'missionDispatch.recordTreatmentForMissionItem':
			return recordMissionTreatment(trx, command.payload);
		case 'controlOperations.updateTreatmentFieldDetails':
			return updateTreatmentFieldDetails(trx, command.payload);
		case 'controlOperations.updateTreatmentLocationAndContext':
			return updateActionRow(
				trx,
				'treatments',
				command.payload.treatmentId,
				command.payload.organizationId,
				{
					...(await locationContextColumns(
						trx,
						command.payload.organizationId,
						command.payload.changes,
						{ collection: true },
					)),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				returnColumns.treatments,
			);
		case 'controlOperations.reviseTreatmentLines':
			return reviseTreatmentLines(trx, command.payload);
		case 'controlOperations.deleteTreatment':
			// The lines go with the Treatment through the registry's unasked
			// cascade; their batch links and the support records ask.
			await applyRecordDeletion(trx, {
				recordType: 'treatment',
				recordId: command.payload.treatmentId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedBatchDeletion: command.payload.acknowledgedBatchDeletion,
					acknowledgedSupportRecordDeletion: command.payload.acknowledgedSupportRecordDeletion,
				},
			});
			return softDelete(
				trx,
				'treatments',
				command.payload.treatmentId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				returnColumns.treatments,
			);
		default:
			throw new Error(`Unsupported treatment command: ${command.type}`);
	}
}
