import {
	applyRecordDeletion,
	assertWriteReferences,
	checkedValues,
	sql,
	updateRow,
} from '@simmer-mosquito/db';
import {
	deleteInspectionCommand,
	type LarvalSurveillanceCommand,
	type RecordHabitatInspectionForAssignmentItemCommand,
	recordAdHocInspectionCommand,
	recordHabitatInspectionCommand,
	recordHabitatInspectionForAssignmentItemCommand,
	updateAdHocInspectionLocationCommand,
	updateInspectionFieldDetailsCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	acknowledged,
	readExecutionOptions,
	readNullableText,
	readText,
} from '../command-payload.js';
import { readDate } from '../command-write.js';
import {
	beginExecution,
	completeExecutedStop,
} from '../field-work-commands/assignment-lifecycle.js';
import {
	type CommandContext,
	commandEndpoint,
	geojsonToGeom,
	habitatTypeReferences,
	hasInspectionResultFields,
	type InspectionResultColumns,
	type InspectionRow,
	type InspectionUpdateColumns,
	inspectionReturnColumns,
	invalidUpdate,
	type LarvalSurveillanceDb,
	type LarvalSurveillanceTransaction,
	loadHabitatSnapshot,
	loadInspectionPolicy,
	localDateColumn,
	type NormalizedInspectionResult,
	readInspectionResult,
	resolveLocationGeom,
	runCommands,
} from './shared.js';

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

/**
 * What this endpoint can be asked to do.
 *
 * The assignment-execution command is a `fieldWork.*` command handled here
 * rather than a larval one, because the endpoint is per-row and the row being
 * written is an inspection. The command vocabulary follows the *unit of work*
 * (a stop, closed by a record); the endpoint follows the table.
 */
export type InspectionCommand =
	| LarvalSurveillanceCommand
	| RecordHabitatInspectionForAssignmentItemCommand;

export function registerInspectionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: LarvalSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post(
		'/larval-surveillance/inspections',
		options.authContextMiddleware,
		commandEndpoint({
			build: async ({ payload, agency: ctx, authContext }) => {
				const policy = await loadInspectionPolicy(options.db, authContext.organization.id);
				const result = readInspectionResult(payload);
				const habitatId = readNullableText(payload.habitatId);
				const assignmentItemId = readNullableText(payload.assignmentItemId);

				// An inspection recorded off an assignment stop is one write, not two:
				// the stop is what sent the inspector here and the record is what closes
				// it. See docs/field-work-support-domain.md, "Assignment Item Execution".
				if (assignmentItemId !== null) {
					return recordHabitatInspectionForAssignmentItemCommand({
						...ctx,
						assignmentItemId,
						inspectionId: readText(payload.id) ?? '',
						habitatId,
						policy,
						completedAt: readDate(payload.completedAt),
						...readExecutionOptions(payload),
						...result,
					});
				}

				return habitatId !== null
					? recordHabitatInspectionCommand({
							...ctx,
							inspectionId: readText(payload.id) ?? '',
							habitatId,
							policy,
							...result,
						})
					: recordAdHocInspectionCommand({
							...ctx,
							inspectionId: readText(payload.id) ?? '',
							locationSource: payload.locationSource as never,
							addressId: readNullableText(payload.addressId),
							habitatTypeId: readNullableText(payload.habitatTypeId),
							policy,
							...result,
						});
			},
			run: (context, commands) => runInspectionCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/larval-surveillance/inspections/:inspectionId',
		options.authContextMiddleware,
		commandEndpoint({
			build: async ({ payload, agency: ctx, authContext, param }) => {
				const inspectionId = param('inspectionId');
				const commands: InspectionCommand[] = [];

				if (hasInspectionResultFields(payload)) {
					const policy = await loadInspectionPolicy(options.db, authContext.organization.id);
					const result = readInspectionResult(payload);
					commands.push(
						updateInspectionFieldDetailsCommand({ ...ctx, inspectionId, policy, ...result }),
					);
				}

				const hasLocation = 'locationSource' in payload;
				const hasAddress = 'addressId' in payload;
				const hasType = 'habitatTypeId' in payload;
				if (hasLocation || hasAddress || hasType) {
					commands.push(
						updateAdHocInspectionLocationCommand({
							...ctx,
							inspectionId,
							...(hasLocation ? { locationSource: payload.locationSource as never } : {}),
							...(hasAddress ? { addressId: readNullableText(payload.addressId) } : {}),
							...(hasType ? { habitatTypeId: readNullableText(payload.habitatTypeId) } : {}),
						}),
					);
				}

				return commands.length === 0 ? invalidUpdate('inspection') : { ok: true, commands };
			},
			run: (context, commands) => runInspectionCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/larval-surveillance/inspections/:inspectionId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'optional',
			build: ({ payload, agency: ctx, param }) =>
				deleteInspectionCommand({
					...ctx,
					inspectionId: param('inspectionId'),
					acknowledgedAssociatedRecordsDeletion: acknowledged(
						payload,
						'acknowledgedAssociatedRecordsDeletion',
					),
					acknowledgedCrossDomainDetach: acknowledged(payload, 'acknowledgedCrossDomainDetach'),
				}),
			run: (context, commands) => runInspectionCommands(context, options.db, commands),
		}),
	);
}

async function runInspectionCommands(
	context: CommandContext,
	db: LarvalSurveillanceDb,
	commands: readonly InspectionCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{ db, write: writeInspectionCommand, notFound: 'inspection_not_found', key: 'inspection' },
		commands,
		createdStatus,
	);
}

/**
 * Exported for `table-commands/inspections.ts`, which reaches the same six
 * commands through `/commands/inspections` and needs the writer unchanged —
 * only the route and how the command is chosen differ.
 */
export async function writeInspectionCommand(
	trx: LarvalSurveillanceTransaction,
	command: InspectionCommand,
): Promise<InspectionRow | null> {
	switch (command.type) {
		case 'larvalSurveillance.recordHabitatInspection': {
			// The habitat type here is copied from the Habitat being inspected, not
			// chosen by the person recording. The gate is about starting to use a
			// retired catalog row; refusing an inherited one would make a Habitat
			// uninspectable because its type was deactivated after it was built.
			const snapshot = await loadHabitatSnapshot(
				trx,
				command.payload.organizationId,
				command.payload.habitatId,
			);
			const row = await trx
				.insertInto('inspections')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.inspectionId,
						organization_id: command.payload.organizationId,
						geom: geojsonToGeom(snapshot.geojson),
						habitat_id: command.payload.habitatId,
						habitat_type_id: snapshot.habitatTypeId,
						address_id: snapshot.addressId,
						inspected_by_profile_id: command.payload.inspectedByProfileId,
						inspection_date: localDateColumn(command.payload.inspectionDate),
						...inspectionResultColumns(command.payload),
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(inspectionReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'fieldWork.recordHabitatInspectionForAssignmentItem':
			return recordInspectionForStop(trx, command.payload);
		case 'larvalSurveillance.recordAdHocInspection': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: habitatTypeReferences(command.payload),
			});
			const row = await trx
				.insertInto('inspections')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.inspectionId,
						organization_id: command.payload.organizationId,
						geom: await resolveLocationGeom(
							trx,
							command.payload.organizationId,
							command.payload.locationSource,
						),
						habitat_id: null,
						habitat_type_id: command.payload.habitatTypeId,
						address_id: command.payload.addressId,
						inspected_by_profile_id: command.payload.inspectedByProfileId,
						inspection_date: localDateColumn(command.payload.inspectionDate),
						...inspectionResultColumns(command.payload),
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(inspectionReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'larvalSurveillance.updateInspectionFieldDetails':
			return updateInspection(trx, command.payload.inspectionId, command.payload.organizationId, {
				inspection_date: localDateColumn(command.payload.inspectionDate),
				inspected_by_profile_id: command.payload.inspectedByProfileId,
				...inspectionResultColumns(command.payload),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.updateAdHocInspectionLocation':
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'update', table: 'inspections', recordId: command.payload.inspectionId },
				references: habitatTypeReferences(command.payload.changes),
			});
			return updateInspection(trx, command.payload.inspectionId, command.payload.organizationId, {
				...(command.payload.changes.locationSource !== undefined
					? {
							geom: await resolveLocationGeom(
								trx,
								command.payload.organizationId,
								command.payload.changes.locationSource,
							),
						}
					: {}),
				...('addressId' in command.payload.changes
					? { address_id: command.payload.changes.addressId ?? null }
					: {}),
				...('habitatTypeId' in command.payload.changes
					? { habitat_type_id: command.payload.changes.habitatTypeId ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.deleteInspection': {
			await applyRecordDeletion(trx, {
				recordType: 'inspection',
				recordId: command.payload.inspectionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedAssociatedRecordsDeletion:
						command.payload.acknowledgedAssociatedRecordsDeletion,
					acknowledgedCrossDomainDetach: command.payload.acknowledgedCrossDomainDetach,
				},
			});
			const row = await trx
				.updateTable('inspections')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.inspectionId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(inspectionReturnColumns)
				.executeTakeFirst();
			return row ?? null;
		}
		default:
			throw new Error(`Unsupported inspection command: ${command.type}`);
	}
}

/**
 * An inspection recorded off an assignment stop: the record and the stop's
 * completion are one transaction, so the work can never exist with the stop
 * still pending.
 */
async function recordInspectionForStop(
	trx: LarvalSurveillanceTransaction,
	payload: RecordHabitatInspectionForAssignmentItemCommand['payload'],
): Promise<InspectionRow | null> {
	// Locks the assignment, judges the transition, auto-starts if asked, and
	// tells us which habitat the stop actually names. Throws the refusal
	// before anything is written.
	const stop = await beginExecution(
		trx,
		payload.assignmentItemId,
		payload.organizationId,
		payload.actorProfileId,
		{ entityType: 'habitat', entityId: payload.habitatId },
		{
			autoStart: payload.autoStartAssignment,
			acknowledgedCompletedItemAdditionalRecord: payload.acknowledgedCompletedItemAdditionalRecord,
			acknowledgedTargetMismatch: payload.acknowledgedTargetMismatch,
			// What the double-submit refusal counts: the inspections already filed
			// against this stop.
			recordedHere: {
				key: 'stopInspections',
				table: 'inspections',
				singular: 'inspection',
				plural: 'inspections',
				match: sql`assignment_item_id = ${payload.assignmentItemId}::uuid
					and organization_id = ${payload.organizationId}::uuid
					and deleted_at is null`,
			},
			completeItem: payload.completeAssignmentItem,
			completedAt: payload.completedAt,
		},
	);
	// The stop's own habitat is the default, so the ordinary call carries no
	// habitatId at all and cannot disagree with the stop.
	const habitatId = payload.habitatId ?? stop.entityId;
	const snapshot = await loadHabitatSnapshot(trx, payload.organizationId, habitatId);
	// Same inherited habitat type as `recordHabitatInspection`, and ungated for
	// the same reason: it is a copy of the Habitat's own type, not a choice.
	const row = await trx
		.insertInto('inspections')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.inspectionId,
				organization_id: payload.organizationId,
				geom: geojsonToGeom(snapshot.geojson),
				habitat_id: habitatId,
				habitat_type_id: snapshot.habitatTypeId,
				address_id: snapshot.addressId,
				inspected_by_profile_id: payload.inspectedByProfileId,
				inspection_date: localDateColumn(payload.inspectionDate),
				assignment_item_id: payload.assignmentItemId,
				...inspectionResultColumns(payload),
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(inspectionReturnColumns)
		.executeTakeFirstOrThrow();
	if (payload.completeAssignmentItem) {
		await completeExecutedStop(
			trx,
			payload.assignmentItemId,
			payload.organizationId,
			payload.actorProfileId,
			payload.completedAt,
		);
	}
	return row;
}

async function updateInspection(
	trx: LarvalSurveillanceTransaction,
	inspectionId: string,
	organizationId: string,
	set: InspectionUpdateColumns,
): Promise<InspectionRow | null> {
	return updateRow(trx, 'inspections', inspectionId, organizationId, set, inspectionReturnColumns);
}

function inspectionResultColumns(result: NormalizedInspectionResult): InspectionResultColumns {
	return {
		is_wet: result.isWet,
		dip_count: result.dipCount,
		density: result.density,
		larvae_count: result.larvaeCount,
		has_first_instar: result.hasFirstInstar,
		has_second_instar: result.hasSecondInstar,
		has_third_instar: result.hasThirdInstar,
		has_fourth_instar: result.hasFourthInstar,
		has_pupae: result.hasPupae,
		has_eggs: result.hasEggs,
	};
}
