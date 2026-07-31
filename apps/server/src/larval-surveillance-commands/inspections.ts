import { type MutationWriteResult, sql } from '@simmer-mosquito/db';
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
import {
	agencyCommandContext,
	type CommandContext,
	createCommand,
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
	readCurrentTransactionId,
	readInspectionResult,
	readJsonObject,
	readNullableText,
	readOptionalJsonObject,
	readText,
	resolveLocationGeom,
	type SafeInspection,
	toSafeInspection,
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
	app.post('/larval-surveillance/inspections', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}

		const authContext = context.get('authContext');
		const ctx = agencyCommandContext(authContext);
		const policy = await loadInspectionPolicy(options.db, authContext.organization.id);
		const result = readInspectionResult(raw.payload);
		const habitatId = readNullableText(raw.payload.habitatId);

		const commandResult =
			habitatId !== null
				? createCommand(() =>
						recordHabitatInspectionCommand({
							...ctx,
							inspectionId: readText(raw.payload.id) ?? '',
							habitatId,
							policy,
							...result,
						}),
					)
				: createCommand(() =>
						recordAdHocInspectionCommand({
							...ctx,
							inspectionId: readText(raw.payload.id) ?? '',
							locationSource: raw.payload.locationSource as never,
							addressId: readNullableText(raw.payload.addressId),
							habitatTypeId: readNullableText(raw.payload.habitatTypeId),
							policy,
							...result,
						}),
					);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		return runInspectionCommands(context, options.db, [commandResult.command], 201);
	});

	app.patch(
		'/larval-surveillance/inspections/:inspectionId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const authContext = context.get('authContext');
			const ctx = agencyCommandContext(authContext);
			const inspectionId = context.req.param('inspectionId');
			const commands: LarvalSurveillanceCommand[] = [];

			if (hasInspectionResultFields(raw.payload)) {
				const policy = await loadInspectionPolicy(options.db, authContext.organization.id);
				const result = readInspectionResult(raw.payload);
				const fieldResult = createCommand(() =>
					updateInspectionFieldDetailsCommand({ ...ctx, inspectionId, policy, ...result }),
				);
				if (!fieldResult.ok) {
					return context.json(fieldResult.body, 400);
				}
				commands.push(fieldResult.command);
			}

			const hasLocation = 'locationSource' in raw.payload;
			const hasAddress = 'addressId' in raw.payload;
			const hasType = 'habitatTypeId' in raw.payload;
			if (hasLocation || hasAddress || hasType) {
				const locationResult = createCommand(() =>
					updateAdHocInspectionLocationCommand({
						...ctx,
						inspectionId,
						...(hasLocation ? { locationSource: raw.payload.locationSource as never } : {}),
						...(hasAddress ? { addressId: readNullableText(raw.payload.addressId) } : {}),
						...(hasType ? { habitatTypeId: readNullableText(raw.payload.habitatTypeId) } : {}),
					}),
				);
				if (!locationResult.ok) {
					return context.json(locationResult.body, 400);
				}
				commands.push(locationResult.command);
			}

			if (commands.length === 0) {
				return context.json(invalidUpdate('inspection').body, 400);
			}

			return runInspectionCommands(context, options.db, commands);
		},
	);

	app.delete(
		'/larval-surveillance/inspections/:inspectionId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readOptionalJsonObject(context.req);
			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				deleteInspectionCommand({
					...ctx,
					inspectionId: context.req.param('inspectionId'),
					acknowledgedAssociatedRecordsDeletion:
						raw?.acknowledgedAssociatedRecordsDeletion !== false,
					acknowledgedCrossDomainDetach: raw?.acknowledgedCrossDomainDetach !== false,
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runInspectionCommands(context, options.db, [commandResult.command]);
		},
	);
}

async function runInspectionCommands(
	context: CommandContext,
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeInspectionCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'inspection_not_found' }, 404);
		}
		return context.json({ inspection: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeInspectionCommands(
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
): Promise<MutationWriteResult<SafeInspection | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeInspection | null = null;
		for (const command of commands) {
			row = await writeInspectionCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
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
