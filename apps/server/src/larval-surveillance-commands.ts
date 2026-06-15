import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	addInspectionSampleCommand,
	addSampleSpeciesCountCommand,
	addUnlabeledInspectionSampleCommand,
	clearHabitatInaccessibleCommand,
	clearSampleZeroLarvaeCommand,
	createHabitatCommand,
	createHabitatFromInspectionCommand,
	DomainValidationError,
	deleteHabitatCommand,
	deleteInspectionCommand,
	deleteInspectionSampleCommand,
	deleteSampleSpeciesCountCommand,
	type LarvalDensity,
	type LarvalSurveillanceCommand,
	markHabitatInaccessibleCommand,
	markSampleZeroLarvaeCommand,
	type ResolvedLarvalInspectionEntryPolicy,
	reactivateHabitatCommand,
	recordAdHocInspectionCommand,
	recordHabitatInspectionCommand,
	resolveOrganizationSettings,
	retireHabitatCommand,
	setSampleNonMosquitoPresenceCommand,
	setSampleUnidentifiableReasonCommand,
	updateAdHocInspectionLocationCommand,
	updateHabitatConfigurationCommand,
	updateHabitatDetailsCommand,
	updateHabitatLocationCommand,
	updateInspectionFieldDetailsCommand,
	updateInspectionSampleCommand,
	updateSampleSpeciesCountCommand,
} from '@simmer-mosquito/domain';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';

type LarvalSurveillanceDb = Kysely<SimmerDatabase>;
type LarvalSurveillanceTransaction = Transaction<SimmerDatabase>;
type CommandContext = Context<{ Variables: AuthVariables }>;

/**
 * Larval surveillance command endpoints (habitats, inspections, samples,
 * sample-species counts). Like the adult-surveillance routes, the client issues
 * plain POST/PATCH/DELETE per row; the server decomposes each into the larval
 * domain command vocabulary and commits in a single Kysely transaction.
 *
 * Inspection result validation depends on the agency's larval inspection entry
 * policy, which lives in `organizations.settings` and is resolved per request.
 */
export function registerLarvalSurveillanceCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: LarvalSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	registerHabitatRoutes(app, options);
	registerInspectionRoutes(app, options);
	registerSampleRoutes(app, options);
	registerSampleSpeciesRoutes(app, options);
}

// ---------------------------------------------------------------------------
// Habitats
// ---------------------------------------------------------------------------

function registerHabitatRoutes(
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

async function loadHabitatSnapshot(
	trx: LarvalSurveillanceTransaction,
	organizationId: string,
	habitatId: string,
): Promise<{
	readonly geojson: unknown;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
}> {
	const row = await trx
		.selectFrom('habitats')
		.select(['geojson', 'habitat_type_id', 'address_id'])
		.where('id', '=', habitatId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		throw new CommandError(404, { error: 'habitat_not_found' });
	}
	return {
		geojson: row.geojson,
		habitatTypeId: row.habitat_type_id,
		addressId: row.address_id,
	};
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

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

function registerInspectionRoutes(
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

interface NormalizedInspectionResult {
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
	readonly hasEggs: boolean;
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

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

function registerSampleRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: LarvalSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post('/larval-surveillance/samples', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}

		const ctx = agencyCommandContext(context.get('authContext'));
		const displayName = readNullableText(raw.payload.displayName);
		const commandResult =
			displayName !== null
				? createCommand(() =>
						addInspectionSampleCommand({
							...ctx,
							sampleId: readText(raw.payload.id) ?? '',
							inspectionId: readText(raw.payload.inspectionId) ?? '',
							displayName,
						}),
					)
				: createCommand(() =>
						addUnlabeledInspectionSampleCommand({
							...ctx,
							sampleId: readText(raw.payload.id) ?? '',
							inspectionId: readText(raw.payload.inspectionId) ?? '',
						}),
					);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		return runSampleCommands(context, options.db, [commandResult.command], 201);
	});

	app.patch(
		'/larval-surveillance/samples/:sampleId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const commandsResult = buildSampleUpdateCommands(
				context.get('authContext'),
				context.req.param('sampleId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}

			return runSampleCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/larval-surveillance/samples/:sampleId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readOptionalJsonObject(context.req);
			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				deleteInspectionSampleCommand({
					...ctx,
					sampleId: context.req.param('sampleId'),
					acknowledgedAssociatedRecordsDeletion:
						raw?.acknowledgedAssociatedRecordsDeletion !== false,
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runSampleCommands(context, options.db, [commandResult.command]);
		},
	);
}

function buildSampleUpdateCommands(
	authContext: AuthContext,
	sampleId: string,
	payload: Record<string, unknown>,
):
	| { readonly ok: true; readonly commands: readonly LarvalSurveillanceCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const ctx = agencyCommandContext(authContext);
	const commands: LarvalSurveillanceCommand[] = [];

	if ('displayName' in payload) {
		const result = createCommand(() =>
			updateInspectionSampleCommand({
				...ctx,
				sampleId,
				displayName: readText(payload.displayName) ?? '',
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.isZeroLarvae === 'boolean') {
		const result = createCommand(() =>
			payload.isZeroLarvae
				? markSampleZeroLarvaeCommand({ ...ctx, sampleId })
				: clearSampleZeroLarvaeCommand({ ...ctx, sampleId }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.hasNonMosquito === 'boolean') {
		const result = createCommand(() =>
			setSampleNonMosquitoPresenceCommand({
				...ctx,
				sampleId,
				hasNonMosquito: payload.hasNonMosquito === true,
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if ('unidentifiableReason' in payload) {
		const result = createCommand(() =>
			setSampleUnidentifiableReasonCommand({
				...ctx,
				sampleId,
				unidentifiableReason: readNullableText(payload.unidentifiableReason),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('sample');
	}

	return { ok: true, commands };
}

async function runSampleCommands(
	context: CommandContext,
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeSampleCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'sample_not_found' }, 404);
		}
		return context.json({ sample: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeSampleCommands(
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
): Promise<MutationWriteResult<SafeSample | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeSample | null = null;
		for (const command of commands) {
			row = await writeSampleCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeSampleCommand(
	trx: LarvalSurveillanceTransaction,
	command: LarvalSurveillanceCommand,
): Promise<SafeSample | null> {
	switch (command.type) {
		case 'larvalSurveillance.addInspectionSample':
			return insertSample(trx, {
				id: command.payload.sampleId,
				organizationId: command.payload.organizationId,
				inspectionId: command.payload.inspectionId,
				displayName: command.payload.displayName,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.addUnlabeledInspectionSample':
			return insertSample(trx, {
				id: command.payload.sampleId,
				organizationId: command.payload.organizationId,
				inspectionId: command.payload.inspectionId,
				displayName: null,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.updateInspectionSample':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				...(command.payload.changes.displayName !== undefined
					? { display_name: command.payload.changes.displayName }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.markSampleZeroLarvae':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				is_zero_larvae: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.clearSampleZeroLarvae':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				is_zero_larvae: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.setSampleNonMosquitoPresence':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				has_non_mosquito: command.payload.hasNonMosquito,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.setSampleUnidentifiableReason':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				unidentifiable_reason: command.payload.unidentifiableReason,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.deleteInspectionSample': {
			const row = await trx
				.updateTable('samples')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.sampleId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(sampleReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeSample(row);
		}
		default:
			throw new Error(`Unsupported sample command: ${command.type}`);
	}
}

async function insertSample(
	trx: LarvalSurveillanceTransaction,
	input: {
		readonly id: string;
		readonly organizationId: string;
		readonly inspectionId: string;
		readonly displayName: string | null;
		readonly actorProfileId: string;
	},
): Promise<SafeSample> {
	const row = await trx
		.insertInto('samples')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			inspection_id: input.inspectionId,
			display_name: input.displayName,
			is_zero_larvae: false,
			has_non_mosquito: false,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(sampleReturnColumns)
		.executeTakeFirstOrThrow();
	return toSafeSample(row);
}

async function updateSample(
	trx: LarvalSurveillanceTransaction,
	sampleId: string,
	organizationId: string,
	set: SampleUpdateColumns,
): Promise<SafeSample | null> {
	const row = await trx
		.updateTable('samples')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', sampleId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(sampleReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeSample(row);
}

// ---------------------------------------------------------------------------
// Sample species counts
// ---------------------------------------------------------------------------

function registerSampleSpeciesRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: LarvalSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post(
		'/larval-surveillance/sample-species',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				addSampleSpeciesCountCommand({
					...ctx,
					sampleSpeciesId: readText(raw.payload.id) ?? '',
					sampleId: readText(raw.payload.sampleId) ?? '',
					speciesId: readText(raw.payload.speciesId) ?? '',
					larvaeCount: readNumber(raw.payload.larvaeCount) ?? Number.NaN,
					identifiedByProfileId: readNullableText(raw.payload.identifiedByProfileId),
					identifiedAt: readText(raw.payload.identifiedAt) ?? '',
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runSampleSpeciesCommands(context, options.db, [commandResult.command], 201);
		},
	);

	app.patch(
		'/larval-surveillance/sample-species/:sampleSpeciesId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const ctx = agencyCommandContext(context.get('authContext'));
			const payload = raw.payload;
			const commandResult = createCommand(() =>
				updateSampleSpeciesCountCommand({
					...ctx,
					sampleSpeciesId: context.req.param('sampleSpeciesId'),
					...('speciesId' in payload ? { speciesId: readText(payload.speciesId) ?? '' } : {}),
					...('larvaeCount' in payload
						? { larvaeCount: readNumber(payload.larvaeCount) ?? Number.NaN }
						: {}),
					...('identifiedByProfileId' in payload
						? { identifiedByProfileId: readNullableText(payload.identifiedByProfileId) }
						: {}),
					...('identifiedAt' in payload
						? { identifiedAt: readText(payload.identifiedAt) ?? '' }
						: {}),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runSampleSpeciesCommands(context, options.db, [commandResult.command]);
		},
	);

	app.delete(
		'/larval-surveillance/sample-species/:sampleSpeciesId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				deleteSampleSpeciesCountCommand({
					...ctx,
					sampleSpeciesId: context.req.param('sampleSpeciesId'),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runSampleSpeciesCommands(context, options.db, [commandResult.command]);
		},
	);
}

async function runSampleSpeciesCommands(
	context: CommandContext,
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeSampleSpeciesCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'sample_species_not_found' }, 404);
		}
		return context.json({ sampleSpecies: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeSampleSpeciesCommands(
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
): Promise<MutationWriteResult<SafeSampleSpecies | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeSampleSpecies | null = null;
		for (const command of commands) {
			row = await writeSampleSpeciesCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeSampleSpeciesCommand(
	trx: LarvalSurveillanceTransaction,
	command: LarvalSurveillanceCommand,
): Promise<SafeSampleSpecies | null> {
	switch (command.type) {
		case 'larvalSurveillance.addSampleSpeciesCount': {
			const row = await trx
				.insertInto('sample_species')
				.values({
					id: command.payload.sampleSpeciesId,
					organization_id: command.payload.organizationId,
					sample_id: command.payload.sampleId,
					species_id: command.payload.speciesId,
					larvae_count: command.payload.larvaeCount,
					identified_by_profile_id: command.payload.identifiedByProfileId,
					identified_at: localDateColumn(command.payload.identifiedAt),
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(sampleSpeciesReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeSampleSpecies(row);
		}
		case 'larvalSurveillance.updateSampleSpeciesCount': {
			const changes = command.payload.changes;
			const row = await trx
				.updateTable('sample_species')
				.set({
					...('speciesId' in changes ? { species_id: changes.speciesId } : {}),
					...('larvaeCount' in changes ? { larvae_count: changes.larvaeCount } : {}),
					...('identifiedByProfileId' in changes
						? { identified_by_profile_id: changes.identifiedByProfileId ?? null }
						: {}),
					...('identifiedAt' in changes && changes.identifiedAt !== undefined
						? { identified_at: localDateColumn(changes.identifiedAt) }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.sampleSpeciesId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(sampleSpeciesReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeSampleSpecies(row);
		}
		case 'larvalSurveillance.deleteSampleSpeciesCount': {
			const row = await trx
				.updateTable('sample_species')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.sampleSpeciesId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(sampleSpeciesReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeSampleSpecies(row);
		}
		default:
			throw new Error(`Unsupported sample species command: ${command.type}`);
	}
}

// ---------------------------------------------------------------------------
// Geometry + policy resolution
// ---------------------------------------------------------------------------

async function resolveLocationGeom(
	trx: LarvalSurveillanceTransaction,
	organizationId: string,
	source: { readonly kind: string } & Record<string, unknown>,
): Promise<ReturnType<typeof geojsonToGeom>> {
	switch (source.kind) {
		case 'geometry':
			return geojsonToGeom(source.geometry);
		case 'address':
			return geojsonToGeom(
				await loadGeojson(trx, 'addresses', source.addressId as string, organizationId),
			);
		case 'habitat':
			return geojsonToGeom(
				await loadGeojson(trx, 'habitats', source.habitatId as string, organizationId),
			);
		case 'inspection':
			return geojsonToGeom(
				await loadGeojson(trx, 'inspections', source.inspectionId as string, organizationId),
			);
		case 'serviceRequest':
			return geojsonToGeom(
				await loadGeojson(
					trx,
					'service_requests',
					source.serviceRequestId as string,
					organizationId,
				),
			);
		default:
			throw new CommandError(400, { error: 'unsupported_location_source' });
	}
}

async function loadGeojson(
	trx: LarvalSurveillanceTransaction,
	table: 'addresses' | 'habitats' | 'inspections' | 'service_requests',
	id: string,
	organizationId: string,
): Promise<unknown> {
	const row = await trx
		.selectFrom(table)
		.select('geojson')
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		throw new CommandError(404, { error: `${table}_not_found` });
	}
	return row.geojson;
}

async function loadInspectionPolicy(
	db: LarvalSurveillanceDb,
	organizationId: string,
): Promise<ResolvedLarvalInspectionEntryPolicy> {
	const organization = await db
		.selectFrom('organizations')
		.select('settings')
		.where('id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return resolveOrganizationSettings(organization?.settings).settings.larvalSurveillance
		.inspectionEntryPolicy;
}

function geojsonToGeom(geojson: unknown) {
	const serialized = JSON.stringify(geojson);
	return sql<string>`st_force2d(st_setsrid(st_geomfromgeojson(
		case
			when (${serialized}::jsonb -> 'geometry') is not null
				then (${serialized}::jsonb -> 'geometry')::text
			else ${serialized}
		end
	), 4326))`;
}

function localDateColumn(value: string) {
	return sql<Date>`${value}::date`;
}

// ---------------------------------------------------------------------------
// Request payload helpers
// ---------------------------------------------------------------------------

function readInspectionResult(payload: Record<string, unknown>): NormalizedInspectionResult & {
	readonly inspectionDate: string;
	readonly inspectedByProfileId: string | null;
} {
	return {
		inspectionDate: readText(payload.inspectionDate) ?? '',
		inspectedByProfileId: readNullableText(payload.inspectedByProfileId),
		isWet: payload.isWet === true,
		dipCount: readNumberOrNull(payload.dipCount),
		density: readDensity(payload.density),
		larvaeCount: readNumberOrNull(payload.larvaeCount),
		hasFirstInstar: payload.hasFirstInstar === true,
		hasSecondInstar: payload.hasSecondInstar === true,
		hasThirdInstar: payload.hasThirdInstar === true,
		hasFourthInstar: payload.hasFourthInstar === true,
		hasPupae: payload.hasPupae === true,
		hasEggs: payload.hasEggs === true,
	};
}

function hasInspectionResultFields(payload: Record<string, unknown>): boolean {
	return 'inspectionDate' in payload || 'isWet' in payload;
}

function readDensity(value: unknown): LarvalDensity | null {
	return value === 'none' ||
		value === 'light' ||
		value === 'medium' ||
		value === 'heavy' ||
		value === 'very_heavy'
		? value
		: null;
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

const habitatReturnColumns = [
	'id',
	'organization_id',
	'address_id',
	'habitat_type_id',
	'habitat_name',
	'description',
	'is_active',
	'is_inaccessible',
	'metadata',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeHabitat {
	readonly id: string;
	readonly organizationId: string;
	readonly addressId: string | null;
	readonly habitatTypeId: string | null;
	readonly habitatName: string | null;
	readonly description: string;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
	readonly metadata: unknown | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeHabitat(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly address_id: string | null;
	readonly habitat_type_id: string | null;
	readonly habitat_name: string | null;
	readonly description: string;
	readonly is_active: boolean;
	readonly is_inaccessible: boolean;
	readonly metadata: unknown | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeHabitat {
	return {
		id: row.id,
		organizationId: row.organization_id,
		addressId: row.address_id,
		habitatTypeId: row.habitat_type_id,
		habitatName: row.habitat_name,
		description: row.description,
		isActive: row.is_active,
		isInaccessible: row.is_inaccessible,
		metadata: row.metadata,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const inspectionReturnColumns = [
	'id',
	'organization_id',
	'habitat_id',
	'habitat_type_id',
	'address_id',
	'inspected_by_profile_id',
	'inspection_date',
	'is_wet',
	'dip_count',
	'density',
	'larvae_count',
	'has_first_instar',
	'has_second_instar',
	'has_third_instar',
	'has_fourth_instar',
	'has_pupae',
	'has_eggs',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeInspection {
	readonly id: string;
	readonly organizationId: string;
	readonly habitatId: string | null;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly inspectedByProfileId: string | null;
	readonly inspectionDate: Date;
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
	readonly hasEggs: boolean;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeInspection(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly habitat_id: string | null;
	readonly habitat_type_id: string | null;
	readonly address_id: string | null;
	readonly inspected_by_profile_id: string | null;
	readonly inspection_date: Date;
	readonly is_wet: boolean;
	readonly dip_count: number | null;
	readonly density: LarvalDensity | null;
	readonly larvae_count: number | null;
	readonly has_first_instar: boolean;
	readonly has_second_instar: boolean;
	readonly has_third_instar: boolean;
	readonly has_fourth_instar: boolean;
	readonly has_pupae: boolean;
	readonly has_eggs: boolean;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeInspection {
	return {
		id: row.id,
		organizationId: row.organization_id,
		habitatId: row.habitat_id,
		habitatTypeId: row.habitat_type_id,
		addressId: row.address_id,
		inspectedByProfileId: row.inspected_by_profile_id,
		inspectionDate: row.inspection_date,
		isWet: row.is_wet,
		dipCount: row.dip_count,
		density: row.density,
		larvaeCount: row.larvae_count,
		hasFirstInstar: row.has_first_instar,
		hasSecondInstar: row.has_second_instar,
		hasThirdInstar: row.has_third_instar,
		hasFourthInstar: row.has_fourth_instar,
		hasPupae: row.has_pupae,
		hasEggs: row.has_eggs,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const sampleReturnColumns = [
	'id',
	'organization_id',
	'inspection_id',
	'display_name',
	'is_zero_larvae',
	'has_non_mosquito',
	'unidentifiable_reason',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeSample {
	readonly id: string;
	readonly organizationId: string;
	readonly inspectionId: string;
	readonly displayName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeSample(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly inspection_id: string;
	readonly display_name: string | null;
	readonly is_zero_larvae: boolean;
	readonly has_non_mosquito: boolean;
	readonly unidentifiable_reason: string | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeSample {
	return {
		id: row.id,
		organizationId: row.organization_id,
		inspectionId: row.inspection_id,
		displayName: row.display_name,
		isZeroLarvae: row.is_zero_larvae,
		hasNonMosquito: row.has_non_mosquito,
		unidentifiableReason: row.unidentifiable_reason,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const sampleSpeciesReturnColumns = [
	'id',
	'organization_id',
	'sample_id',
	'species_id',
	'identified_by_profile_id',
	'identified_at',
	'larvae_count',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeSampleSpecies {
	readonly id: string;
	readonly organizationId: string;
	readonly sampleId: string;
	readonly speciesId: string;
	readonly identifiedByProfileId: string | null;
	readonly identifiedAt: Date;
	readonly larvaeCount: number;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeSampleSpecies(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly sample_id: string;
	readonly species_id: string;
	readonly identified_by_profile_id: string | null;
	readonly identified_at: Date;
	readonly larvae_count: number;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeSampleSpecies {
	return {
		id: row.id,
		organizationId: row.organization_id,
		sampleId: row.sample_id,
		speciesId: row.species_id,
		identifiedByProfileId: row.identified_by_profile_id,
		identifiedAt: row.identified_at,
		larvaeCount: row.larvae_count,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ---------------------------------------------------------------------------
// Shared command + request helpers
// ---------------------------------------------------------------------------

type HabitatUpdateColumns = {
	geom?: ReturnType<typeof geojsonToGeom>;
	address_id?: string | null;
	habitat_type_id?: string | null;
	habitat_name?: string | null;
	description?: string;
	metadata?: unknown | null;
	is_active?: boolean;
	is_inaccessible?: boolean;
	updated_by_profile_id: string;
};

type InspectionResultColumns = {
	is_wet: boolean;
	dip_count: number | null;
	density: LarvalDensity | null;
	larvae_count: number | null;
	has_first_instar: boolean;
	has_second_instar: boolean;
	has_third_instar: boolean;
	has_fourth_instar: boolean;
	has_pupae: boolean;
	has_eggs: boolean;
};

type InspectionUpdateColumns = {
	geom?: ReturnType<typeof geojsonToGeom>;
	habitat_type_id?: string | null;
	address_id?: string | null;
	inspected_by_profile_id?: string | null;
	inspection_date?: ReturnType<typeof localDateColumn>;
	updated_by_profile_id: string;
} & Partial<InspectionResultColumns>;

type SampleUpdateColumns = {
	display_name?: string | null;
	is_zero_larvae?: boolean;
	has_non_mosquito?: boolean;
	unidentifiable_reason?: string | null;
	updated_by_profile_id: string;
};

class CommandError extends Error {
	constructor(
		readonly status: 400 | 404,
		readonly body: { readonly error: string },
	) {
		super(body.error);
	}
}

function handleCommandError(context: CommandContext, error: unknown) {
	if (error instanceof CommandError) {
		return context.json(error.body, error.status);
	}
	throw error;
}

type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

function createCommand<TCommand extends LarvalSurveillanceCommand>(
	build: () => TCommand,
):
	| { readonly ok: true; readonly command: TCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	try {
		return { ok: true, command: build() };
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return {
				ok: false,
				body: { error: 'invalid_command', message: error.message, issues: error.issues },
			};
		}
		throw error;
	}
}

function invalidUpdate(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: { error: 'invalid_command', message, issues: [{ path: 'changes', message }] },
	};
}

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

async function readCurrentTransactionId(trx: LarvalSurveillanceTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}
	return Number.parseInt(txid, 10);
}

type JsonResult =
	| { readonly ok: true; readonly payload: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string };

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<JsonResult> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}
	if (!isRecord(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}
	return { ok: true, payload: raw };
}

async function readOptionalJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<Record<string, unknown> | undefined> {
	try {
		const raw = await request.json();
		return isRecord(raw) ? raw : undefined;
	} catch {
		return undefined;
	}
}

function readText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readNullableText(value: unknown): string | null {
	return readText(value);
}

function readNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readNumberOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
