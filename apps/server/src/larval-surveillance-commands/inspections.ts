import { applyRecordDeletion, sql } from '@simmer-mosquito/db';
import {
	deleteInspectionCommand,
	type LarvalSurveillanceCommand,
	recordAdHocInspectionCommand,
	recordHabitatInspectionCommand,
	updateAdHocInspectionLocationCommand,
	updateInspectionFieldDetailsCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readText } from '../command-payload.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	type CommandContext,
	commandActor,
	commandEndpoint,
	geojsonToGeom,
	handleCommandError,
	hasInspectionResultFields,
	type InspectionResultColumns,
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
	type SafeInspection,
	toSafeInspection,
	writeCommands,
} from './shared.js';

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

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
				const commands: LarvalSurveillanceCommand[] = [];

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
					acknowledgedAssociatedRecordsDeletion:
						payload.acknowledgedAssociatedRecordsDeletion !== false,
					acknowledgedCrossDomainDetach: payload.acknowledgedCrossDomainDetach !== false,
				}),
			run: (context, commands) => runInspectionCommands(context, options.db, commands),
		}),
	);
}

async function runInspectionCommands(
	context: CommandContext,
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
	createdStatus?: 201,
) {
	const denial = denyUnauthorizedAgencyCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await writeCommands(
			db,
			commandActor(context.get('authContext')),
			commands,
			writeInspectionCommand,
		);
		if (result.row === null) {
			return context.json({ error: 'inspection_not_found' }, 404);
		}
		return context.json({ inspection: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeInspectionCommand(
	trx: LarvalSurveillanceTransaction,
	command: LarvalSurveillanceCommand,
): Promise<SafeInspection | null> {
	switch (command.type) {
		case 'larvalSurveillance.recordHabitatInspection': {
			const snapshot = await loadHabitatSnapshot(
				trx,
				command.payload.organizationId,
				command.payload.habitatId,
			);
			const row = await trx
				.insertInto('inspections')
				.values({
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
				})
				.returning(inspectionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeInspection(row);
		}
		case 'larvalSurveillance.recordAdHocInspection': {
			const row = await trx
				.insertInto('inspections')
				.values({
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
				})
				.returning(inspectionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeInspection(row);
		}
		case 'larvalSurveillance.updateInspectionFieldDetails':
			return updateInspection(trx, command.payload.inspectionId, command.payload.organizationId, {
				inspection_date: localDateColumn(command.payload.inspectionDate),
				inspected_by_profile_id: command.payload.inspectedByProfileId,
				...inspectionResultColumns(command.payload),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.updateAdHocInspectionLocation':
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
			return row === undefined ? null : toSafeInspection(row);
		}
		default:
			throw new Error(`Unsupported inspection command: ${command.type}`);
	}
}

async function updateInspection(
	trx: LarvalSurveillanceTransaction,
	inspectionId: string,
	organizationId: string,
	set: InspectionUpdateColumns,
): Promise<SafeInspection | null> {
	const row = await trx
		.updateTable('inspections')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', inspectionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(inspectionReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeInspection(row);
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
