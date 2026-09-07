import {
	applyRecordDeletion,
	assertClearanceAcknowledged,
	assertWriteReferences,
	type CatalogReference,
	checkedValues,
	sql,
} from '@simmer-mosquito/db';
import type {
	ControlOperationsCommand,
	RecordChemicalApplicationForMissionItemCommand,
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
	type ApplicationRow,
	type ApplicationUpdateColumns,
	type ControlOperationsTransaction,
	contextIds,
	insertApplicationBatch,
	localDateColumn,
	locationContextColumns,
	resolveGeom,
	softDelete,
} from './shared.js';

// ===========================================================================
// Chemical applications
// ===========================================================================

/** Plus the mission helper, which writes an application and closes the stop. */
export type ApplicationCommand =
	| ControlOperationsCommand
	| RecordChemicalApplicationForMissionItemCommand;

/**
 * The four catalogs a chemical application names.
 *
 * Only the keys present are gated, so an update that moves the amount and
 * nothing else asks nothing of the catalogs, and one that moves the insecticide
 * asks only about that.
 */
function applicationCatalogReferences(source: {
	readonly applicationMethodId?: string | null | undefined;
	readonly insecticideId?: string | null | undefined;
	readonly vehicleId?: string | null | undefined;
	readonly equipmentId?: string | null | undefined;
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
	if ('insecticideId' in source) {
		references.push({
			column: 'insecticide_id',
			catalog: 'insecticide',
			id: source.insecticideId ?? null,
			label: 'insecticide',
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
	return references;
}

async function writeMissionApplication(
	trx: ControlOperationsTransaction,
	payload: RecordChemicalApplicationForMissionItemCommand['payload'],
): Promise<ApplicationRow | null> {
	const stop = await beginMissionExecution(trx, payload, 'chemicalApplication');
	await assertWriteReferences(trx, {
		organizationId: payload.organizationId,
		write: { kind: 'create' },
		references: applicationCatalogReferences(payload),
	});
	const ids = contextIds(payload.context ?? { kind: 'none' });
	const row = await trx
		.insertInto('applications')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.applicationId,
				organization_id: payload.organizationId,
				// `defaultMissionMethodId` falls back to the method the mission plan
				// named. Only the payload's own id is gated, above: a plan's method is
				// not a new choice.
				application_method_id: defaultMissionMethodId(payload.applicationMethodId, stop),
				insecticide_id: payload.insecticideId,
				applicator_profile_id: payload.applicatorProfileId,
				application_date: localDateColumn(payload.applicationDate),
				geom: missionItemGeom(payload.missionItemId, payload.geometry),
				address_id: payload.addressId ?? null,
				vehicle_id: payload.vehicleId,
				equipment_id: payload.equipmentId,
				amount_applied: payload.amountApplied,
				application_unit_id: payload.applicationUnitId,
				habitat_id: ids.habitatId,
				collection_id: ids.collectionId,
				inspection_id: ids.inspectionId,
				requested_control_action_id: stop.requestedControlActionId,
				mission_item_id: payload.missionItemId,
				metadata: payload.metadata,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(returnColumns.applications)
		.executeTakeFirstOrThrow();
	for (const batch of payload.applicationBatches) {
		await insertApplicationBatch(trx, {
			id: batch.applicationBatchId,
			organizationId: payload.organizationId,
			applicationId: payload.applicationId,
			insecticideBatchId: batch.insecticideBatchId,
			actorProfileId: payload.actorProfileId,
		});
	}
	await assertMissionGeometryCovered(trx, payload, payload.applicationId, 'applications');
	await finishMissionExecution(trx, payload, stop);
	return row;
}

export async function writeApplicationCommand(
	trx: ControlOperationsTransaction,
	command: ApplicationCommand,
): Promise<ApplicationRow | null> {
	switch (command.type) {
		case 'controlOperations.recordChemicalApplication': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: applicationCatalogReferences(command.payload),
			});
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('applications')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.applicationId,
						organization_id: command.payload.organizationId,
						application_method_id: command.payload.applicationMethodId,
						insecticide_id: command.payload.insecticideId,
						applicator_profile_id: command.payload.applicatorProfileId,
						application_date: localDateColumn(command.payload.applicationDate),
						geom: await resolveGeom(
							trx,
							command.payload.organizationId,
							command.payload.locationSource,
						),
						address_id: command.payload.addressId,
						vehicle_id: command.payload.vehicleId,
						equipment_id: command.payload.equipmentId,
						amount_applied: command.payload.amountApplied,
						application_unit_id: command.payload.applicationUnitId,
						habitat_id: ids.habitatId,
						collection_id: ids.collectionId,
						inspection_id: ids.inspectionId,
						requested_control_action_id: command.payload.requestedControlActionId,
						metadata: command.payload.metadata,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(returnColumns.applications)
				.executeTakeFirstOrThrow();
			for (const batch of command.payload.applicationBatches) {
				await insertApplicationBatch(trx, {
					id: batch.applicationBatchId,
					organizationId: command.payload.organizationId,
					applicationId: command.payload.applicationId,
					insecticideBatchId: batch.insecticideBatchId,
					actorProfileId: command.payload.actorProfileId,
				});
			}
			return row;
		}
		case 'missionDispatch.recordChemicalApplicationForMissionItem':
			return writeMissionApplication(trx, command.payload);
		case 'controlOperations.updateChemicalApplicationFieldDetails': {
			const changes = command.payload.changes;
			if (changes.insecticideId !== undefined) {
				await clearIncompatibleBatches(trx, {
					applicationId: command.payload.applicationId,
					organizationId: command.payload.organizationId,
					insecticideId: changes.insecticideId,
					actorProfileId: command.payload.actorProfileId,
					acknowledged: command.payload.acknowledgedBatchClearance,
				});
			}
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'update', table: 'applications', recordId: command.payload.applicationId },
				references: applicationCatalogReferences(changes),
			});
			return updateApplication(trx, command.payload.applicationId, command.payload.organizationId, {
				...('applicationDate' in changes && changes.applicationDate !== undefined
					? { application_date: localDateColumn(changes.applicationDate) }
					: {}),
				...('applicatorProfileId' in changes
					? { applicator_profile_id: changes.applicatorProfileId ?? null }
					: {}),
				...('applicationMethodId' in changes
					? { application_method_id: changes.applicationMethodId ?? null }
					: {}),
				...('insecticideId' in changes ? { insecticide_id: changes.insecticideId } : {}),
				...('amountApplied' in changes ? { amount_applied: changes.amountApplied } : {}),
				...('applicationUnitId' in changes
					? { application_unit_id: changes.applicationUnitId }
					: {}),
				...('vehicleId' in changes ? { vehicle_id: changes.vehicleId ?? null } : {}),
				...('equipmentId' in changes ? { equipment_id: changes.equipmentId ?? null } : {}),
				...('metadata' in changes ? { metadata: changes.metadata ?? null } : {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		}
		case 'controlOperations.updateChemicalApplicationLocationAndContext':
			return updateApplication(trx, command.payload.applicationId, command.payload.organizationId, {
				...(await locationContextColumns(
					trx,
					command.payload.organizationId,
					command.payload.changes,
					{
						collection: true,
					},
				)),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.deleteChemicalApplication':
			await applyRecordDeletion(trx, {
				recordType: 'application',
				recordId: command.payload.applicationId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedBatchDeletion: command.payload.acknowledgedBatchDeletion,
					acknowledgedSupportRecordDeletion: command.payload.acknowledgedSupportRecordDeletion,
				},
			});
			return softDelete(
				trx,
				'applications',
				command.payload.applicationId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				returnColumns.applications,
			);
		default:
			throw new Error(`Unsupported application command: ${command.type}`);
	}
}

/**
 * Drop the batch links a corrected insecticide leaves behind.
 *
 * `application_batches` records which physical batches of the product went out.
 * Correcting the application's insecticide makes every batch of the old product
 * a link to something that was not applied, so those rows go. The batches of the
 * new product, if any are already linked, stay.
 *
 * Counted before anything is written, because the organization is being told it
 * is about to lose the batch numbers it recorded in the field. An application
 * whose batches all belong to the new insecticide loses nothing and is not
 * asked.
 */
async function clearIncompatibleBatches(
	trx: ControlOperationsTransaction,
	input: {
		readonly applicationId: string;
		readonly organizationId: string;
		readonly insecticideId: string;
		readonly actorProfileId: string;
		readonly acknowledged: boolean;
	},
): Promise<void> {
	const incompatible = sql`application_id = ${input.applicationId}
		and organization_id = ${input.organizationId}
		and deleted_at is null
		and insecticide_batch_id in (
			select id from insecticide_batches
			where organization_id = ${input.organizationId}
				and insecticide_id <> ${input.insecticideId}
		)`;

	await assertClearanceAcknowledged(trx, {
		acknowledgement: 'acknowledgedBatchClearance',
		acknowledged: input.acknowledged,
		rules: [
			{
				key: 'applicationBatches',
				table: 'application_batches',
				singular: 'batch record',
				plural: 'batch records',
				match: incompatible,
			},
		],
	});

	await sql`
		update application_batches
		set deleted_at = now(),
			deleted_by_profile_id = ${input.actorProfileId},
			updated_by_profile_id = ${input.actorProfileId},
			updated_at = now()
		where ${incompatible}
	`.execute(trx);
}

async function updateApplication(
	trx: ControlOperationsTransaction,
	applicationId: string,
	organizationId: string,
	set: ApplicationUpdateColumns,
): Promise<ApplicationRow | null> {
	const row = await trx
		.updateTable('applications')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', applicationId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(returnColumns.applications)
		.executeTakeFirst();
	return row ?? null;
}
