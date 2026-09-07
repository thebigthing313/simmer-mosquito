import {
	applyRecordDeletion,
	assertWriteReferences,
	type CatalogReference,
	checkedValues,
} from '@simmer-mosquito/db';
import type {
	ControlOperationsCommand,
	RecordBiocontrolActionForMissionItemCommand,
	RecordOutreachActionForMissionItemCommand,
	RecordSourceReductionForMissionItemCommand,
} from '@simmer-mosquito/domain';
import {
	assertMissionGeometryCovered,
	beginMissionExecution,
	finishMissionExecution,
	missionItemGeom,
	resolveMissionMethodId,
} from '../mission-dispatch/mission-execution.js';
import {
	type BiocontrolActionRow,
	biocontrolActionReturnColumns,
	type ControlOperationsTransaction,
	contextIds,
	localDateColumn,
	locationContextColumns,
	type OutreachActionRow,
	outreachActionReturnColumns,
	resolveGeom,
	type SourceReductionRow,
	softDelete,
	sourceReductionReturnColumns,
	updateActionRow,
} from './shared.js';

// ===========================================================================
// Source reduction / outreach / biocontrol actions (shared shape)
// ===========================================================================

/**
 * What these three tables can be asked to do.
 *
 * The `missionDispatch.*` helpers are handled here rather than under mission
 * dispatch because the row being written is a control action; the command
 * vocabulary follows the unit of work, the endpoint follows the table. Same
 * split as the assignment execution commands on the surveillance tables.
 */
export type ActionCommand =
	| ControlOperationsCommand
	| RecordSourceReductionForMissionItemCommand
	| RecordOutreachActionForMissionItemCommand
	| RecordBiocontrolActionForMissionItemCommand;

// --- Source reductions ---

async function writeMissionSourceReduction(
	trx: ControlOperationsTransaction,
	payload: RecordSourceReductionForMissionItemCommand['payload'],
): Promise<SourceReductionRow | null> {
	const stop = await beginMissionExecution(trx, payload, 'sourceReduction');
	// A method the mission plan supplied is not a new choice, so only an id
	// the payload names is gated.
	await assertWriteReferences(trx, {
		organizationId: payload.organizationId,
		write: { kind: 'create' },
		references: methodReferences('sourceReduction', payload.sourceReductionMethodId),
	});
	const ids = contextIds(payload.context ?? { kind: 'none' });
	const row = await trx
		.insertInto('source_reductions')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.sourceReductionId,
				organization_id: payload.organizationId,
				source_reduction_method_id: resolveMissionMethodId(payload.sourceReductionMethodId, stop),
				technician_profile_id: payload.technicianProfileId,
				source_reduction_date: localDateColumn(payload.sourceReductionDate),
				sources_eliminated_amount: payload.sourcesEliminatedAmount,
				sources_eliminated_unit_id: payload.sourcesEliminatedUnitId,
				geom: missionItemGeom(payload.missionItemId, payload.geometry),
				address_id: payload.addressId ?? null,
				habitat_id: ids.habitatId,
				inspection_id: ids.inspectionId,
				requested_control_action_id: stop.requestedControlActionId,
				mission_item_id: payload.missionItemId,
				metadata: payload.metadata,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(sourceReductionReturnColumns)
		.executeTakeFirstOrThrow();
	await assertMissionGeometryCovered(trx, payload, payload.sourceReductionId, 'source_reductions');
	await finishMissionExecution(trx, payload, stop);
	return row;
}

async function writeMissionOutreachAction(
	trx: ControlOperationsTransaction,
	payload: RecordOutreachActionForMissionItemCommand['payload'],
): Promise<OutreachActionRow | null> {
	const stop = await beginMissionExecution(trx, payload, 'outreach');
	// A method the mission plan supplied is not a new choice, so only an id
	// the payload names is gated.
	await assertWriteReferences(trx, {
		organizationId: payload.organizationId,
		write: { kind: 'create' },
		references: methodReferences('outreach', payload.outreachMethodId),
	});
	const ids = contextIds(payload.context ?? { kind: 'none' });
	const row = await trx
		.insertInto('outreach_actions')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.outreachActionId,
				organization_id: payload.organizationId,
				outreach_method_id: resolveMissionMethodId(payload.outreachMethodId, stop),
				technician_profile_id: payload.technicianProfileId,
				outreach_date: localDateColumn(payload.outreachDate),
				reach: payload.reach ?? 0,
				reach_description: payload.reachDescription,
				geom: missionItemGeom(payload.missionItemId, payload.geometry),
				address_id: payload.addressId ?? null,
				inspection_id: ids.inspectionId,
				requested_control_action_id: stop.requestedControlActionId,
				mission_item_id: payload.missionItemId,
				metadata: payload.metadata,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(outreachActionReturnColumns)
		.executeTakeFirstOrThrow();
	await assertMissionGeometryCovered(trx, payload, payload.outreachActionId, 'outreach_actions');
	await finishMissionExecution(trx, payload, stop);
	return row;
}

async function writeMissionBiocontrolAction(
	trx: ControlOperationsTransaction,
	payload: RecordBiocontrolActionForMissionItemCommand['payload'],
): Promise<BiocontrolActionRow | null> {
	const stop = await beginMissionExecution(trx, payload, 'biocontrol');
	// A method the mission plan supplied is not a new choice, so only an id
	// the payload names is gated.
	await assertWriteReferences(trx, {
		organizationId: payload.organizationId,
		write: { kind: 'create' },
		references: methodReferences('biocontrol', payload.biocontrolMethodId),
	});
	const ids = contextIds(payload.context ?? { kind: 'none' });
	const row = await trx
		.insertInto('biocontrol_actions')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.biocontrolActionId,
				organization_id: payload.organizationId,
				biocontrol_method_id: resolveMissionMethodId(payload.biocontrolMethodId, stop),
				technician_profile_id: payload.technicianProfileId,
				biocontrol_date: localDateColumn(payload.biocontrolDate),
				amount_released: payload.amountReleased,
				release_unit_id: payload.releaseUnitId,
				geom: missionItemGeom(payload.missionItemId, payload.geometry),
				address_id: payload.addressId ?? null,
				habitat_id: ids.habitatId,
				inspection_id: ids.inspectionId,
				requested_control_action_id: stop.requestedControlActionId,
				mission_item_id: payload.missionItemId,
				metadata: payload.metadata,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(biocontrolActionReturnColumns)
		.executeTakeFirstOrThrow();
	await assertMissionGeometryCovered(
		trx,
		payload,
		payload.biocontrolActionId,
		'biocontrol_actions',
	);
	await finishMissionExecution(trx, payload, stop);
	return row;
}

/**
 * The one catalog each performed action names: its method.
 *
 * The three action kinds differ only in the column, the catalog, and the noun.
 * Naming them once here rather than passing three strings at each of the nine
 * call sites keeps the trio from being retyped, and in an order that would
 * still compile if two of them were swapped.
 */
const ACTION_METHODS = {
	sourceReduction: {
		column: 'source_reduction_method_id',
		catalog: 'sourceReductionMethod',
		label: 'source reduction method',
	},
	outreach: {
		column: 'outreach_method_id',
		catalog: 'outreachMethod',
		label: 'outreach method',
	},
	biocontrol: {
		column: 'biocontrol_method_id',
		catalog: 'biocontrolMethod',
		label: 'biocontrol method',
	},
} as const satisfies Record<string, Omit<CatalogReference, 'id'>>;

type ActionKind = keyof typeof ACTION_METHODS;

/** The method reference for one action kind, or none when no id was named. */
function methodReferences(kind: ActionKind, id: string | null | undefined): CatalogReference[] {
	return [{ ...ACTION_METHODS[kind], id: id ?? null }];
}

export async function writeSourceReductionCommand(
	trx: ControlOperationsTransaction,
	command: ActionCommand,
): Promise<SourceReductionRow | null> {
	switch (command.type) {
		case 'controlOperations.recordSourceReduction': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: methodReferences('sourceReduction', command.payload.sourceReductionMethodId),
			});
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('source_reductions')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.sourceReductionId,
						organization_id: command.payload.organizationId,
						source_reduction_method_id: command.payload.sourceReductionMethodId,
						technician_profile_id: command.payload.technicianProfileId,
						source_reduction_date: localDateColumn(command.payload.sourceReductionDate),
						geom: await resolveGeom(
							trx,
							command.payload.organizationId,
							command.payload.locationSource,
						),
						address_id: command.payload.addressId,
						habitat_id: ids.habitatId,
						sources_eliminated_amount: command.payload.sourcesEliminatedAmount,
						sources_eliminated_unit_id: command.payload.sourcesEliminatedUnitId,
						inspection_id: ids.inspectionId,
						requested_control_action_id: command.payload.requestedControlActionId,
						metadata: command.payload.metadata,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(sourceReductionReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'missionDispatch.recordSourceReductionForMissionItem':
			return writeMissionSourceReduction(trx, command.payload);
		case 'controlOperations.updateSourceReductionFieldDetails': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: {
					kind: 'update',
					table: 'source_reductions',
					recordId: command.payload.sourceReductionId,
				},
				references:
					'sourceReductionMethodId' in command.payload.changes
						? methodReferences('sourceReduction', command.payload.changes.sourceReductionMethodId)
						: [],
			});
			const changes = command.payload.changes;
			return updateActionRow(
				trx,
				'source_reductions',
				command.payload.sourceReductionId,
				command.payload.organizationId,
				{
					...('sourceReductionDate' in changes && changes.sourceReductionDate !== undefined
						? { source_reduction_date: localDateColumn(changes.sourceReductionDate) }
						: {}),
					...('technicianProfileId' in changes
						? { technician_profile_id: changes.technicianProfileId ?? null }
						: {}),
					...('sourceReductionMethodId' in changes
						? { source_reduction_method_id: changes.sourceReductionMethodId }
						: {}),
					...('sourcesEliminatedAmount' in changes
						? { sources_eliminated_amount: changes.sourcesEliminatedAmount }
						: {}),
					...('sourcesEliminatedUnitId' in changes
						? { sources_eliminated_unit_id: changes.sourcesEliminatedUnitId }
						: {}),
					...('metadata' in changes ? { metadata: changes.metadata ?? null } : {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				sourceReductionReturnColumns,
			);
		}
		case 'controlOperations.updateSourceReductionLocationAndContext':
			return updateActionRow(
				trx,
				'source_reductions',
				command.payload.sourceReductionId,
				command.payload.organizationId,
				{
					...(await locationContextColumns(
						trx,
						command.payload.organizationId,
						command.payload.changes,
						{},
					)),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				sourceReductionReturnColumns,
			);
		case 'controlOperations.deleteSourceReduction':
			await applyRecordDeletion(trx, {
				recordType: 'sourceReduction',
				recordId: command.payload.sourceReductionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedSupportRecordDeletion: command.payload.acknowledgedSupportRecordDeletion,
				},
			});
			return softDelete(
				trx,
				'source_reductions',
				command.payload.sourceReductionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				sourceReductionReturnColumns,
			);
		default:
			throw new Error(`Unsupported source reduction command: ${command.type}`);
	}
}

// --- Outreach actions ---

export async function writeOutreachActionCommand(
	trx: ControlOperationsTransaction,
	command: ActionCommand,
): Promise<OutreachActionRow | null> {
	switch (command.type) {
		case 'controlOperations.recordOutreachAction': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: methodReferences('outreach', command.payload.outreachMethodId),
			});
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('outreach_actions')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.outreachActionId,
						organization_id: command.payload.organizationId,
						outreach_method_id: command.payload.outreachMethodId,
						technician_profile_id: command.payload.technicianProfileId,
						outreach_date: localDateColumn(command.payload.outreachDate),
						geom: await resolveGeom(
							trx,
							command.payload.organizationId,
							command.payload.locationSource,
						),
						address_id: command.payload.addressId,
						inspection_id: ids.inspectionId,
						reach: command.payload.reach,
						reach_description: command.payload.reachDescription,
						requested_control_action_id: command.payload.requestedControlActionId,
						metadata: command.payload.metadata,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(outreachActionReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'missionDispatch.recordOutreachActionForMissionItem':
			return writeMissionOutreachAction(trx, command.payload);
		case 'controlOperations.updateOutreachActionFieldDetails': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: {
					kind: 'update',
					table: 'outreach_actions',
					recordId: command.payload.outreachActionId,
				},
				references:
					'outreachMethodId' in command.payload.changes
						? methodReferences('outreach', command.payload.changes.outreachMethodId)
						: [],
			});
			const changes = command.payload.changes;
			return updateActionRow(
				trx,
				'outreach_actions',
				command.payload.outreachActionId,
				command.payload.organizationId,
				{
					...('outreachDate' in changes && changes.outreachDate !== undefined
						? { outreach_date: localDateColumn(changes.outreachDate) }
						: {}),
					...('technicianProfileId' in changes
						? { technician_profile_id: changes.technicianProfileId ?? null }
						: {}),
					...('outreachMethodId' in changes
						? { outreach_method_id: changes.outreachMethodId }
						: {}),
					...('reach' in changes ? { reach: changes.reach } : {}),
					...('reachDescription' in changes
						? { reach_description: changes.reachDescription ?? null }
						: {}),
					...('metadata' in changes ? { metadata: changes.metadata ?? null } : {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				outreachActionReturnColumns,
			);
		}
		case 'controlOperations.updateOutreachActionLocationAndContext':
			return updateActionRow(
				trx,
				'outreach_actions',
				command.payload.outreachActionId,
				command.payload.organizationId,
				{
					...(await locationContextColumns(
						trx,
						command.payload.organizationId,
						command.payload.changes,
						{ habitat: false },
					)),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				outreachActionReturnColumns,
			);
		case 'controlOperations.deleteOutreachAction':
			await applyRecordDeletion(trx, {
				recordType: 'outreachAction',
				recordId: command.payload.outreachActionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedSupportRecordDeletion: command.payload.acknowledgedSupportRecordDeletion,
				},
			});
			return softDelete(
				trx,
				'outreach_actions',
				command.payload.outreachActionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				outreachActionReturnColumns,
			);
		default:
			throw new Error(`Unsupported outreach action command: ${command.type}`);
	}
}

// --- Biocontrol actions ---

export async function writeBiocontrolActionCommand(
	trx: ControlOperationsTransaction,
	command: ActionCommand,
): Promise<BiocontrolActionRow | null> {
	switch (command.type) {
		case 'controlOperations.recordBiocontrolAction': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: methodReferences('biocontrol', command.payload.biocontrolMethodId),
			});
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('biocontrol_actions')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.biocontrolActionId,
						organization_id: command.payload.organizationId,
						biocontrol_method_id: command.payload.biocontrolMethodId,
						technician_profile_id: command.payload.technicianProfileId,
						biocontrol_date: localDateColumn(command.payload.biocontrolDate),
						geom: await resolveGeom(
							trx,
							command.payload.organizationId,
							command.payload.locationSource,
						),
						address_id: command.payload.addressId,
						habitat_id: ids.habitatId,
						inspection_id: ids.inspectionId,
						amount_released: command.payload.amountReleased,
						release_unit_id: command.payload.releaseUnitId,
						requested_control_action_id: command.payload.requestedControlActionId,
						metadata: command.payload.metadata,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(biocontrolActionReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'missionDispatch.recordBiocontrolActionForMissionItem':
			return writeMissionBiocontrolAction(trx, command.payload);
		case 'controlOperations.updateBiocontrolActionFieldDetails': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: {
					kind: 'update',
					table: 'biocontrol_actions',
					recordId: command.payload.biocontrolActionId,
				},
				references:
					'biocontrolMethodId' in command.payload.changes
						? methodReferences('biocontrol', command.payload.changes.biocontrolMethodId)
						: [],
			});
			const changes = command.payload.changes;
			return updateActionRow(
				trx,
				'biocontrol_actions',
				command.payload.biocontrolActionId,
				command.payload.organizationId,
				{
					...('biocontrolDate' in changes && changes.biocontrolDate !== undefined
						? { biocontrol_date: localDateColumn(changes.biocontrolDate) }
						: {}),
					...('technicianProfileId' in changes
						? { technician_profile_id: changes.technicianProfileId ?? null }
						: {}),
					...('biocontrolMethodId' in changes
						? { biocontrol_method_id: changes.biocontrolMethodId }
						: {}),
					...('amountReleased' in changes ? { amount_released: changes.amountReleased } : {}),
					...('releaseUnitId' in changes ? { release_unit_id: changes.releaseUnitId } : {}),
					...('metadata' in changes ? { metadata: changes.metadata ?? null } : {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				biocontrolActionReturnColumns,
			);
		}
		case 'controlOperations.updateBiocontrolActionLocationAndContext':
			return updateActionRow(
				trx,
				'biocontrol_actions',
				command.payload.biocontrolActionId,
				command.payload.organizationId,
				{
					...(await locationContextColumns(
						trx,
						command.payload.organizationId,
						command.payload.changes,
						{},
					)),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				biocontrolActionReturnColumns,
			);
		case 'controlOperations.deleteBiocontrolAction':
			await applyRecordDeletion(trx, {
				recordType: 'biocontrolAction',
				recordId: command.payload.biocontrolActionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedSupportRecordDeletion: command.payload.acknowledgedSupportRecordDeletion,
				},
			});
			return softDelete(
				trx,
				'biocontrol_actions',
				command.payload.biocontrolActionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				biocontrolActionReturnColumns,
			);
		default:
			throw new Error(`Unsupported biocontrol action command: ${command.type}`);
	}
}
