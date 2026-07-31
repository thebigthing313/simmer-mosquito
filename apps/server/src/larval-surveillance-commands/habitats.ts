import { type MutationWriteResult, sql } from '@simmer-mosquito/db';
import {
	clearHabitatInaccessibleCommand,
	createHabitatCommand,
	createHabitatFromInspectionCommand,
	deleteHabitatCommand,
	type LarvalSurveillanceCommand,
	markHabitatInaccessibleCommand,
	reactivateHabitatCommand,
	retireHabitatCommand,
	updateHabitatConfigurationCommand,
	updateHabitatDetailsCommand,
	updateHabitatLocationCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import {
	agencyCommandContext,
	type CommandContext,
	CommandError,
	createCommand,
	geojsonToGeom,
	type HabitatUpdateColumns,
	habitatReturnColumns,
	handleCommandError,
	type InvalidCommandBody,
	invalidUpdate,
	type LarvalSurveillanceDb,
	type LarvalSurveillanceTransaction,
	readCurrentTransactionId,
	readJsonObject,
	readNullableText,
	readOptionalJsonObject,
	readText,
	resolveLocationGeom,
	type SafeHabitat,
	toSafeHabitat,
} from './shared.js';

// ---------------------------------------------------------------------------
// Habitats
// ---------------------------------------------------------------------------

export function registerHabitatRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: LarvalSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post('/larval-surveillance/habitats', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}

		const ctx = agencyCommandContext(context.get('authContext'));
		const inspectionId = readNullableText(raw.payload.inspectionId);
		const commandResult =
			inspectionId !== null && raw.payload.locationSource === undefined
				? createCommand(() =>
						createHabitatFromInspectionCommand({
							...ctx,
							habitatId: readText(raw.payload.id) ?? '',
							inspectionId,
							habitatName: readNullableText(raw.payload.habitatName),
							description: readText(raw.payload.description) ?? '',
							metadata: raw.payload.metadata ?? null,
						}),
					)
				: createCommand(() =>
						createHabitatCommand({
							...ctx,
							habitatId: readText(raw.payload.id) ?? '',
							locationSource: raw.payload.locationSource as never,
							addressId: readNullableText(raw.payload.addressId),
							habitatTypeId: readNullableText(raw.payload.habitatTypeId),
							habitatName: readNullableText(raw.payload.habitatName),
							description: readText(raw.payload.description) ?? '',
							metadata: raw.payload.metadata ?? null,
						}),
					);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		return runHabitatCommands(context, options.db, [commandResult.command], 201);
	});

	app.patch(
		'/larval-surveillance/habitats/:habitatId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const commandsResult = buildHabitatUpdateCommands(
				context.get('authContext'),
				context.req.param('habitatId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}

			return runHabitatCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/larval-surveillance/habitats/:habitatId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readOptionalJsonObject(context.req);
			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				deleteHabitatCommand({
					...ctx,
					habitatId: context.req.param('habitatId'),
					acknowledgedHabitatDelete: raw?.acknowledgedHabitatDelete !== false,
					acknowledgedInspectionDetach: raw?.acknowledgedInspectionDetach !== false,
					acknowledgedCrossDomainDetach: raw?.acknowledgedCrossDomainDetach !== false,
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runHabitatCommands(context, options.db, [commandResult.command]);
		},
	);
}

function buildHabitatUpdateCommands(
	authContext: AuthContext,
	habitatId: string,
	payload: Record<string, unknown>,
):
	| { readonly ok: true; readonly commands: readonly LarvalSurveillanceCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const ctx = agencyCommandContext(authContext);
	const commands: LarvalSurveillanceCommand[] = [];

	const hasName = 'habitatName' in payload;
	const hasDescription = 'description' in payload;
	const hasMetadata = 'metadata' in payload;
	if (hasName || hasDescription || hasMetadata) {
		const result = createCommand(() =>
			updateHabitatDetailsCommand({
				...ctx,
				habitatId,
				...(hasName ? { habitatName: readNullableText(payload.habitatName) } : {}),
				...(hasDescription ? { description: readText(payload.description) ?? '' } : {}),
				...(hasMetadata ? { metadata: payload.metadata ?? null } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if ('locationSource' in payload) {
		const result = createCommand(() =>
			updateHabitatLocationCommand({
				...ctx,
				habitatId,
				locationSource: payload.locationSource as never,
				acknowledgedHabitatLocationSemanticsChange: true,
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	const hasAddress = 'addressId' in payload;
	const hasType = 'habitatTypeId' in payload;
	if (hasAddress || hasType) {
		const result = createCommand(() =>
			updateHabitatConfigurationCommand({
				...ctx,
				habitatId,
				...(hasAddress ? { addressId: readNullableText(payload.addressId) } : {}),
				...(hasType ? { habitatTypeId: readNullableText(payload.habitatTypeId) } : {}),
				acknowledgedHabitatConfigurationSemanticsChange: true,
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.isInaccessible === 'boolean') {
		const result = createCommand(() =>
			payload.isInaccessible
				? markHabitatInaccessibleCommand({ ...ctx, habitatId })
				: clearHabitatInaccessibleCommand({ ...ctx, habitatId }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.isActive === 'boolean') {
		const result = createCommand(() =>
			payload.isActive
				? reactivateHabitatCommand({ ...ctx, habitatId })
				: retireHabitatCommand({ ...ctx, habitatId, acknowledgedRouteRemoval: true }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('habitat');
	}

	return { ok: true, commands };
}

async function runHabitatCommands(
	context: CommandContext,
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeHabitatCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'habitat_not_found' }, 404);
		}
		return context.json({ habitat: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeHabitatCommands(
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
): Promise<MutationWriteResult<SafeHabitat | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeHabitat | null = null;
		for (const command of commands) {
			row = await writeHabitatCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeHabitatCommand(
	trx: LarvalSurveillanceTransaction,
	command: LarvalSurveillanceCommand,
): Promise<SafeHabitat | null> {
	switch (command.type) {
		case 'larvalSurveillance.createHabitat': {
			const row = await trx
				.insertInto('habitats')
				.values({
					id: command.payload.habitatId,
					organization_id: command.payload.organizationId,
					geom: await resolveLocationGeom(
						trx,
						command.payload.organizationId,
						command.payload.locationSource,
					),
					address_id: command.payload.addressId,
					habitat_type_id: command.payload.habitatTypeId,
					habitat_name: command.payload.habitatName,
					description: command.payload.description,
					is_active: true,
					is_inaccessible: false,
					metadata: command.payload.metadata,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(habitatReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeHabitat(row);
		}
		case 'larvalSurveillance.createHabitatFromInspection': {
			const snapshot = await loadInspectionSnapshot(
				trx,
				command.payload.organizationId,
				command.payload.inspectionId,
			);
			const habitat = await trx
				.insertInto('habitats')
				.values({
					id: command.payload.habitatId,
					organization_id: command.payload.organizationId,
					geom: geojsonToGeom(snapshot.geojson),
					address_id: snapshot.addressId,
					habitat_type_id: snapshot.habitatTypeId,
					habitat_name: command.payload.habitatName,
					description: command.payload.description,
					is_active: true,
					is_inaccessible: false,
					metadata: command.payload.metadata,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(habitatReturnColumns)
				.executeTakeFirstOrThrow();
			await trx
				.updateTable('inspections')
				.set({ habitat_id: command.payload.habitatId, updated_at: sql`now()` })
				.where('id', '=', command.payload.inspectionId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.execute();
			return toSafeHabitat(habitat);
		}
		case 'larvalSurveillance.updateHabitatDetails':
			return updateHabitat(trx, command.payload.habitatId, command.payload.organizationId, {
				...('habitatName' in command.payload.changes
					? { habitat_name: command.payload.changes.habitatName ?? null }
					: {}),
				...(command.payload.changes.description !== undefined
					? { description: command.payload.changes.description }
					: {}),
				...('metadata' in command.payload.changes
					? { metadata: command.payload.changes.metadata ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.updateHabitatLocation':
			return updateHabitat(trx, command.payload.habitatId, command.payload.organizationId, {
				geom: await resolveLocationGeom(
					trx,
					command.payload.organizationId,
					command.payload.locationSource,
				),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.updateHabitatConfiguration':
			return updateHabitat(trx, command.payload.habitatId, command.payload.organizationId, {
				...('addressId' in command.payload.changes
					? { address_id: command.payload.changes.addressId ?? null }
					: {}),
				...('habitatTypeId' in command.payload.changes
					? { habitat_type_id: command.payload.changes.habitatTypeId ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.markHabitatInaccessible':
			return updateHabitat(trx, command.payload.habitatId, command.payload.organizationId, {
				is_inaccessible: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.clearHabitatInaccessible':
			return updateHabitat(trx, command.payload.habitatId, command.payload.organizationId, {
				is_inaccessible: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.retireHabitat':
			return updateHabitat(trx, command.payload.habitatId, command.payload.organizationId, {
				is_active: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.reactivateHabitat':
			return updateHabitat(trx, command.payload.habitatId, command.payload.organizationId, {
				is_active: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.deleteHabitat': {
			const row = await trx
				.updateTable('habitats')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.habitatId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(habitatReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeHabitat(row);
		}
		default:
			throw new Error(`Unsupported habitat command: ${command.type}`);
	}
}

async function updateHabitat(
	trx: LarvalSurveillanceTransaction,
	habitatId: string,
	organizationId: string,
	set: HabitatUpdateColumns,
): Promise<SafeHabitat | null> {
	const row = await trx
		.updateTable('habitats')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', habitatId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(habitatReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeHabitat(row);
}

async function loadInspectionSnapshot(
	trx: LarvalSurveillanceTransaction,
	organizationId: string,
	inspectionId: string,
): Promise<{
	readonly geojson: unknown;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
}> {
	const row = await trx
		.selectFrom('inspections')
		.select(['geojson', 'habitat_type_id', 'address_id'])
		.where('id', '=', inspectionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		throw new CommandError(404, { error: 'inspection_not_found' });
	}
	return {
		geojson: row.geojson,
		habitatTypeId: row.habitat_type_id,
		addressId: row.address_id,
	};
}
