import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	type AdultCollectionLocationSourceInput,
	type AdultSurveillanceCommand,
	addCollectionSpeciesCountCommand,
	type CollectedCollectionTiming,
	type CollectionTiming,
	cancelPendingCollectionCommand,
	clearCollectionZeroResultCommand,
	collectCollectionCommand,
	createTrapCommand,
	DomainValidationError,
	deleteCollectionCommand,
	deleteCollectionSpeciesCountCommand,
	deleteTrapCommand,
	markCollectionZeroResultCommand,
	reactivateTrapCommand,
	recordCollectedAdHocCollectionCommand,
	recordCollectedTrapCollectionCommand,
	retireTrapCommand,
	setAdHocCollectionCommand,
	setCollectionBycatchCommand,
	setTrapCollectionCommand,
	type TrapLocationSourceInput,
	updateAdHocCollectionConfigurationCommand,
	updateCollectionFieldDetailsCommand,
	updateCollectionSpeciesCountCommand,
	updateTrapConfigurationCommand,
	updateTrapDetailsCommand,
} from '@simmer-mosquito/domain';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';

type AdultSurveillanceDb = Kysely<SimmerDatabase>;
type AdultSurveillanceTransaction = Transaction<SimmerDatabase>;

/**
 * Adult surveillance command endpoints.
 *
 * The client issues plain optimistic POST/PATCH/DELETE per row; the server
 * decomposes each request into the rich adult-surveillance domain command
 * vocabulary (mirroring the control-asset command pattern) and commits the
 * resulting commands in a single Kysely transaction, returning the affected
 * row plus the Postgres transaction id Electric uses to confirm the mutation.
 */
export function registerAdultSurveillanceCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdultSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	registerTrapRoutes(app, options);
	registerCollectionRoutes(app, options);
	registerCollectionSpeciesRoutes(app, options);
}

// ---------------------------------------------------------------------------
// Traps
// ---------------------------------------------------------------------------

function registerTrapRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdultSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post('/adult-surveillance/traps', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}

		const ctx = agencyCommandContext(context.get('authContext'));
		const commandResult = createCommand(() =>
			createTrapCommand({
				...ctx,
				trapId: readText(raw.payload.id) ?? '',
				locationSource: raw.payload.locationSource as TrapLocationSourceInput,
				collectionMethodId: readText(raw.payload.collectionMethodId) ?? '',
				addressId: readNullableText(raw.payload.addressId),
				collectionLureId: readNullableText(raw.payload.collectionLureId),
				trapName: readNullableText(raw.payload.trapName),
				trapCode: readNullableText(raw.payload.trapCode),
				description: readNullableText(raw.payload.description),
				acknowledgedDuplicateTrapCode: raw.payload.acknowledgedDuplicateTrapCode === true,
			}),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		return runTrapCommands(context, options.db, [commandResult.command], 201);
	});

	app.patch('/adult-surveillance/traps/:trapId', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}

		const trapId = context.req.param('trapId');
		const commandsResult = buildTrapUpdateCommands(context.get('authContext'), trapId, raw.payload);
		if (!commandsResult.ok) {
			return context.json(commandsResult.body, 400);
		}

		return runTrapCommands(context, options.db, commandsResult.commands);
	});

	app.delete(
		'/adult-surveillance/traps/:trapId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readOptionalJsonObject(context.req);
			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				deleteTrapCommand({
					...ctx,
					trapId: context.req.param('trapId'),
					acknowledgedCascadeDelete: raw?.acknowledgedCascadeDelete !== false,
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runTrapCommands(context, options.db, [commandResult.command]);
		},
	);
}

function buildTrapUpdateCommands(
	authContext: AuthContext,
	trapId: string,
	payload: Record<string, unknown>,
):
	| { readonly ok: true; readonly commands: readonly AdultSurveillanceCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const ctx = agencyCommandContext(authContext);
	const commands: AdultSurveillanceCommand[] = [];

	const hasName = 'trapName' in payload;
	const hasCode = 'trapCode' in payload;
	const hasDescription = 'description' in payload;
	if (hasName || hasCode || hasDescription) {
		const result = createCommand(() =>
			updateTrapDetailsCommand({
				...ctx,
				trapId,
				...(hasName ? { trapName: readNullableText(payload.trapName) } : {}),
				...(hasCode ? { trapCode: readNullableText(payload.trapCode) } : {}),
				...(hasDescription ? { description: readNullableText(payload.description) } : {}),
				acknowledgedHistoricalLabelChange: true,
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	const hasLocation = 'locationSource' in payload;
	const hasMethod = 'collectionMethodId' in payload;
	const hasAddress = 'addressId' in payload;
	const hasLure = 'collectionLureId' in payload;
	if (hasLocation || hasMethod || hasAddress || hasLure) {
		const result = createCommand(() =>
			updateTrapConfigurationCommand({
				...ctx,
				trapId,
				...(hasLocation
					? { locationSource: payload.locationSource as TrapLocationSourceInput }
					: {}),
				...(hasMethod ? { collectionMethodId: readText(payload.collectionMethodId) ?? '' } : {}),
				...(hasAddress ? { addressId: readNullableText(payload.addressId) } : {}),
				...(hasLure ? { collectionLureId: readNullableText(payload.collectionLureId) } : {}),
				acknowledgedTrapLocationSemanticsChange: true,
				acknowledgedTrapMethodSemanticsChange: true,
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.isActive === 'boolean') {
		const result = createCommand(() =>
			payload.isActive
				? reactivateTrapCommand({ ...ctx, trapId, acknowledgedDuplicateTrapCode: true })
				: retireTrapCommand({ ...ctx, trapId }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('trap');
	}

	return { ok: true, commands };
}

async function runTrapCommands(
	context: CommandContext,
	db: AdultSurveillanceDb,
	commands: readonly AdultSurveillanceCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeTrapCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'trap_not_found' }, 404);
		}
		return context.json({ trap: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeTrapCommands(
	db: AdultSurveillanceDb,
	commands: readonly AdultSurveillanceCommand[],
): Promise<MutationWriteResult<SafeTrap | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeTrap | null = null;
		for (const command of commands) {
			row = await writeTrapCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeTrapCommand(
	trx: AdultSurveillanceTransaction,
	command: AdultSurveillanceCommand,
): Promise<SafeTrap | null> {
	switch (command.type) {
		case 'adultSurveillance.createTrap': {
			const row = await trx
				.insertInto('traps')
				.values({
					id: command.payload.trapId,
					organization_id: command.payload.organizationId,
					geom: await resolveLocationGeom(
						trx,
						command.payload.organizationId,
						command.payload.locationSource,
					),
					collection_method_id: command.payload.collectionMethodId,
					address_id: command.payload.addressId,
					collection_lure_id: command.payload.collectionLureId,
					trap_name: command.payload.trapName,
					trap_code: command.payload.trapCode,
					description: command.payload.description,
					is_active: true,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(trapReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeTrap(row);
		}
		case 'adultSurveillance.updateTrapDetails':
			return updateTrap(trx, command.payload.trapId, command.payload.organizationId, {
				...('trapName' in command.payload.changes
					? { trap_name: command.payload.changes.trapName ?? null }
					: {}),
				...('trapCode' in command.payload.changes
					? { trap_code: command.payload.changes.trapCode ?? null }
					: {}),
				...('description' in command.payload.changes
					? { description: command.payload.changes.description ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.updateTrapConfiguration':
			return updateTrap(trx, command.payload.trapId, command.payload.organizationId, {
				...(command.payload.changes.locationSource !== undefined
					? {
							geom: await resolveLocationGeom(
								trx,
								command.payload.organizationId,
								command.payload.changes.locationSource,
							),
						}
					: {}),
				...('collectionMethodId' in command.payload.changes
					? { collection_method_id: command.payload.changes.collectionMethodId }
					: {}),
				...('addressId' in command.payload.changes
					? { address_id: command.payload.changes.addressId ?? null }
					: {}),
				...('collectionLureId' in command.payload.changes
					? { collection_lure_id: command.payload.changes.collectionLureId ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.retireTrap':
			return updateTrap(trx, command.payload.trapId, command.payload.organizationId, {
				is_active: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.reactivateTrap':
			return updateTrap(trx, command.payload.trapId, command.payload.organizationId, {
				is_active: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.deleteTrap': {
			const row = await trx
				.updateTable('traps')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.trapId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(trapReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeTrap(row);
		}
		default:
			throw new Error(`Unsupported trap command: ${command.type}`);
	}
}

async function updateTrap(
	trx: AdultSurveillanceTransaction,
	trapId: string,
	organizationId: string,
	set: TrapUpdateColumns,
): Promise<SafeTrap | null> {
	const row = await trx
		.updateTable('traps')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', trapId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(trapReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeTrap(row);
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

function registerCollectionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdultSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post('/adult-surveillance/collections', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}

		const commandResult = buildCollectionCreateCommand(context.get('authContext'), raw.payload);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		return runCollectionCommands(context, options.db, [commandResult.command], 201);
	});

	app.patch(
		'/adult-surveillance/collections/:collectionId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const commandsResult = buildCollectionUpdateCommands(
				context.get('authContext'),
				context.req.param('collectionId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}

			return runCollectionCommands(context, options.db, commandsResult.commands);
		},
	);

	app.post(
		'/adult-surveillance/collections/:collectionId/collect',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				collectCollectionCommand({
					...ctx,
					collectionId: context.req.param('collectionId'),
					collectedAt: readDate(raw.payload.collectedAt) ?? new Date(Number.NaN),
					collectedByProfileId: readNullableText(raw.payload.collectedByProfileId),
					hasProblem: raw.payload.hasProblem === true,
					metadata: raw.payload.metadata ?? null,
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runCollectionCommands(context, options.db, [commandResult.command]);
		},
	);

	app.post(
		'/adult-surveillance/collections/:collectionId/cancel',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				cancelPendingCollectionCommand({
					...ctx,
					collectionId: context.req.param('collectionId'),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runCollectionCommands(context, options.db, [commandResult.command]);
		},
	);

	app.delete(
		'/adult-surveillance/collections/:collectionId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readOptionalJsonObject(context.req);
			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				deleteCollectionCommand({
					...ctx,
					collectionId: context.req.param('collectionId'),
					acknowledgedSpeciesCountDeletion: raw?.acknowledgedSpeciesCountDeletion !== false,
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runCollectionCommands(context, options.db, [commandResult.command]);
		},
	);
}

function buildCollectionCreateCommand(
	authContext: AuthContext,
	payload: Record<string, unknown>,
):
	| { readonly ok: true; readonly command: AdultSurveillanceCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const ctx = agencyCommandContext(authContext);
	const collectionId = readText(payload.id) ?? '';
	const timing = readCollectionTiming(payload);
	const collected = isCollectedTiming(timing);
	const trapId = readNullableText(payload.trapId);
	const metadata = payload.metadata ?? null;
	const setByProfileId = readNullableText(payload.setByProfileId);

	if (trapId !== null) {
		if (collected) {
			return createCommand(() =>
				recordCollectedTrapCollectionCommand({
					...ctx,
					collectionId,
					trapId,
					timing: timing as CollectedCollectionTiming,
					setByProfileId,
					collectedByProfileId: readNullableText(payload.collectedByProfileId),
					hasProblem: payload.hasProblem === true,
					acknowledgedPendingTrapCollection: true,
					metadata,
				}),
			);
		}
		return createCommand(() =>
			setTrapCollectionCommand({
				...ctx,
				collectionId,
				trapId,
				startedAt: pendingStartedAt(timing),
				setByProfileId,
				metadata,
			}),
		);
	}

	const collectionMethodId = readText(payload.collectionMethodId) ?? '';
	const locationSource = payload.locationSource as AdultCollectionLocationSourceInput;
	const collectionLureId = readNullableText(payload.collectionLureId);
	const addressId = readNullableText(payload.addressId);

	if (collected) {
		return createCommand(() =>
			recordCollectedAdHocCollectionCommand({
				...ctx,
				collectionId,
				collectionMethodId,
				locationSource,
				collectionLureId,
				addressId,
				timing: timing as CollectedCollectionTiming,
				setByProfileId,
				collectedByProfileId: readNullableText(payload.collectedByProfileId),
				hasProblem: payload.hasProblem === true,
				metadata,
			}),
		);
	}

	return createCommand(() =>
		setAdHocCollectionCommand({
			...ctx,
			collectionId,
			collectionMethodId,
			locationSource,
			collectionLureId,
			addressId,
			startedAt: pendingStartedAt(timing),
			setByProfileId,
			metadata,
		}),
	);
}

function buildCollectionUpdateCommands(
	authContext: AuthContext,
	collectionId: string,
	payload: Record<string, unknown>,
):
	| { readonly ok: true; readonly commands: readonly AdultSurveillanceCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const ctx = agencyCommandContext(authContext);
	const commands: AdultSurveillanceCommand[] = [];

	const hasMethod = 'collectionMethodId' in payload;
	const hasLocation = 'locationSource' in payload;
	const hasLure = 'collectionLureId' in payload;
	const hasAddress = 'addressId' in payload;
	if (hasMethod || hasLocation || hasLure || hasAddress) {
		const result = createCommand(() =>
			updateAdHocCollectionConfigurationCommand({
				...ctx,
				collectionId,
				...(hasMethod ? { collectionMethodId: readText(payload.collectionMethodId) ?? '' } : {}),
				...(hasLocation
					? { locationSource: payload.locationSource as AdultCollectionLocationSourceInput }
					: {}),
				...(hasLure ? { collectionLureId: readNullableText(payload.collectionLureId) } : {}),
				...(hasAddress ? { addressId: readNullableText(payload.addressId) } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	const hasTiming = hasTimingFields(payload);
	const hasSetBy = 'setByProfileId' in payload;
	const hasCollectedBy = 'collectedByProfileId' in payload;
	const hasProblem = 'hasProblem' in payload;
	const hasMetadata = 'metadata' in payload;
	if (hasTiming || hasSetBy || hasCollectedBy || hasProblem || hasMetadata) {
		const result = createCommand(() =>
			updateCollectionFieldDetailsCommand({
				...ctx,
				collectionId,
				...(hasTiming ? { timing: readCollectionTiming(payload) } : {}),
				...(hasSetBy ? { setByProfileId: readNullableText(payload.setByProfileId) } : {}),
				...(hasCollectedBy
					? { collectedByProfileId: readNullableText(payload.collectedByProfileId) }
					: {}),
				...(hasProblem ? { hasProblem: payload.hasProblem === true } : {}),
				...(hasMetadata ? { metadata: payload.metadata ?? null } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.isZeroResult === 'boolean') {
		const result = createCommand(() =>
			payload.isZeroResult
				? markCollectionZeroResultCommand({
						...ctx,
						collectionId,
						acknowledgedSpeciesCountsClearance: true,
					})
				: clearCollectionZeroResultCommand({ ...ctx, collectionId }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.hasBycatch === 'boolean') {
		const result = createCommand(() =>
			setCollectionBycatchCommand({
				...ctx,
				collectionId,
				hasBycatch: payload.hasBycatch === true,
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('collection');
	}

	return { ok: true, commands };
}

async function runCollectionCommands(
	context: CommandContext,
	db: AdultSurveillanceDb,
	commands: readonly AdultSurveillanceCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCollectionCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'collection_not_found' }, 404);
		}
		return context.json({ collection: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeCollectionCommands(
	db: AdultSurveillanceDb,
	commands: readonly AdultSurveillanceCommand[],
): Promise<MutationWriteResult<SafeCollection | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeCollection | null = null;
		for (const command of commands) {
			row = await writeCollectionCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeCollectionCommand(
	trx: AdultSurveillanceTransaction,
	command: AdultSurveillanceCommand,
): Promise<SafeCollection | null> {
	switch (command.type) {
		case 'adultSurveillance.setTrapCollection': {
			const snapshot = await loadTrapSnapshot(
				trx,
				command.payload.organizationId,
				command.payload.trapId,
			);
			return insertCollection(trx, {
				id: command.payload.collectionId,
				organizationId: command.payload.organizationId,
				geom: geojsonToGeom(snapshot.geojson),
				trapId: command.payload.trapId,
				collectionMethodId: snapshot.collectionMethodId,
				collectionLureId: snapshot.collectionLureId,
				addressId: snapshot.addressId,
				timing: command.payload.timing,
				setByProfileId: command.payload.setByProfileId,
				collectedByProfileId: null,
				hasProblem: false,
				metadata: command.payload.metadata,
				actorProfileId: command.payload.actorProfileId,
			});
		}
		case 'adultSurveillance.recordCollectedTrapCollection': {
			const snapshot = await loadTrapSnapshot(
				trx,
				command.payload.organizationId,
				command.payload.trapId,
			);
			return insertCollection(trx, {
				id: command.payload.collectionId,
				organizationId: command.payload.organizationId,
				geom: geojsonToGeom(snapshot.geojson),
				trapId: command.payload.trapId,
				collectionMethodId: snapshot.collectionMethodId,
				collectionLureId: snapshot.collectionLureId,
				addressId: snapshot.addressId,
				timing: command.payload.timing,
				setByProfileId: command.payload.setByProfileId,
				collectedByProfileId: command.payload.collectedByProfileId,
				hasProblem: command.payload.hasProblem,
				metadata: command.payload.metadata,
				actorProfileId: command.payload.actorProfileId,
			});
		}
		case 'adultSurveillance.setAdHocCollection':
			return insertCollection(trx, {
				id: command.payload.collectionId,
				organizationId: command.payload.organizationId,
				geom: await resolveLocationGeom(
					trx,
					command.payload.organizationId,
					command.payload.locationSource,
				),
				trapId: null,
				collectionMethodId: command.payload.collectionMethodId,
				collectionLureId: command.payload.collectionLureId,
				addressId: command.payload.addressId,
				timing: command.payload.timing,
				setByProfileId: command.payload.setByProfileId,
				collectedByProfileId: null,
				hasProblem: false,
				metadata: command.payload.metadata,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'adultSurveillance.recordCollectedAdHocCollection':
			return insertCollection(trx, {
				id: command.payload.collectionId,
				organizationId: command.payload.organizationId,
				geom: await resolveLocationGeom(
					trx,
					command.payload.organizationId,
					command.payload.locationSource,
				),
				trapId: null,
				collectionMethodId: command.payload.collectionMethodId,
				collectionLureId: command.payload.collectionLureId,
				addressId: command.payload.addressId,
				timing: command.payload.timing,
				setByProfileId: command.payload.setByProfileId,
				collectedByProfileId: command.payload.collectedByProfileId,
				hasProblem: command.payload.hasProblem,
				metadata: command.payload.metadata,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'adultSurveillance.collectCollection':
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				collected_at: command.payload.collectedAt,
				collected_by_profile_id: command.payload.collectedByProfileId,
				has_problem: command.payload.hasProblem,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.cancelPendingCollection':
			return softDeleteCollection(
				trx,
				command.payload.collectionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
			);
		case 'adultSurveillance.updateCollectionFieldDetails':
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				...(command.payload.changes.timing !== undefined
					? timingColumns(command.payload.changes.timing)
					: {}),
				...('setByProfileId' in command.payload.changes
					? { set_by_profile_id: command.payload.changes.setByProfileId ?? null }
					: {}),
				...('collectedByProfileId' in command.payload.changes
					? { collected_by_profile_id: command.payload.changes.collectedByProfileId ?? null }
					: {}),
				...('hasProblem' in command.payload.changes
					? { has_problem: command.payload.changes.hasProblem ?? false }
					: {}),
				...('metadata' in command.payload.changes
					? { metadata: command.payload.changes.metadata ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.updateAdHocCollectionConfiguration':
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				...(command.payload.changes.locationSource !== undefined
					? {
							geom: await resolveLocationGeom(
								trx,
								command.payload.organizationId,
								command.payload.changes.locationSource,
							),
						}
					: {}),
				...('collectionMethodId' in command.payload.changes
					? { collection_method_id: command.payload.changes.collectionMethodId }
					: {}),
				...('collectionLureId' in command.payload.changes
					? { collection_lure_id: command.payload.changes.collectionLureId ?? null }
					: {}),
				...('addressId' in command.payload.changes
					? { address_id: command.payload.changes.addressId ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.deleteCollection':
			return softDeleteCollection(
				trx,
				command.payload.collectionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
			);
		case 'adultSurveillance.markCollectionZeroResult': {
			await trx
				.updateTable('collection_species')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('collection_id', '=', command.payload.collectionId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.execute();
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				is_zero_result: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		}
		case 'adultSurveillance.clearCollectionZeroResult':
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				is_zero_result: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.setCollectionBycatch':
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				has_bycatch: command.payload.hasBycatch,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		default:
			throw new Error(`Unsupported collection command: ${command.type}`);
	}
}

async function insertCollection(
	trx: AdultSurveillanceTransaction,
	input: CollectionInsertInput,
): Promise<SafeCollection> {
	const row = await trx
		.insertInto('collections')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			geom: input.geom,
			trap_id: input.trapId,
			collection_method_id: input.collectionMethodId,
			collection_lure_id: input.collectionLureId,
			address_id: input.addressId,
			collected_by_profile_id: input.collectedByProfileId,
			set_by_profile_id: input.setByProfileId,
			has_problem: input.hasProblem,
			metadata: input.metadata,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
			...timingColumns(input.timing),
		})
		.returning(collectionReturnColumns)
		.executeTakeFirstOrThrow();
	return toSafeCollection(row);
}

async function updateCollection(
	trx: AdultSurveillanceTransaction,
	collectionId: string,
	organizationId: string,
	set: CollectionUpdateColumns,
): Promise<SafeCollection | null> {
	const row = await trx
		.updateTable('collections')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', collectionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(collectionReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeCollection(row);
}

async function softDeleteCollection(
	trx: AdultSurveillanceTransaction,
	collectionId: string,
	organizationId: string,
	actorProfileId: string,
): Promise<SafeCollection | null> {
	const row = await trx
		.updateTable('collections')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', collectionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(collectionReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeCollection(row);
}

function timingColumns(timing: CollectionTiming): CollectionTimingColumns {
	if (timing.mode === 'collection_date_duration') {
		return {
			collection_timing_mode: 'collection_date_duration',
			started_at: null,
			collected_at: null,
			collection_date: localDateColumn(timing.collectionDate),
			duration_amount: timing.durationAmount,
			duration_unit_id: timing.durationUnitId,
		};
	}
	return {
		collection_timing_mode: 'exact_timestamps',
		started_at: timing.startedAt,
		collected_at: 'collectedAt' in timing ? timing.collectedAt : null,
		collection_date: null,
		duration_amount: null,
		duration_unit_id: null,
	};
}

// ---------------------------------------------------------------------------
// Collection species counts
// ---------------------------------------------------------------------------

function registerCollectionSpeciesRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdultSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post(
		'/adult-surveillance/collection-species',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				addCollectionSpeciesCountCommand({
					...ctx,
					collectionSpeciesId: readText(raw.payload.id) ?? '',
					collectionId: readText(raw.payload.collectionId) ?? '',
					speciesId: readText(raw.payload.speciesId) ?? '',
					count: readNumber(raw.payload.count) ?? Number.NaN,
					sex: readSpeciesSex(raw.payload.sex),
					status: readSpeciesStatus(raw.payload.status),
					identifiedByProfileId: readNullableText(raw.payload.identifiedByProfileId),
					identifiedDate: readText(raw.payload.identifiedDate) ?? '',
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runCollectionSpeciesCommands(context, options.db, [commandResult.command], 201);
		},
	);

	app.patch(
		'/adult-surveillance/collection-species/:collectionSpeciesId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const ctx = agencyCommandContext(context.get('authContext'));
			const payload = raw.payload;
			const commandResult = createCommand(() =>
				updateCollectionSpeciesCountCommand({
					...ctx,
					collectionSpeciesId: context.req.param('collectionSpeciesId'),
					...('count' in payload ? { count: readNumber(payload.count) ?? Number.NaN } : {}),
					...('speciesId' in payload ? { speciesId: readText(payload.speciesId) ?? '' } : {}),
					...('sex' in payload ? { sex: readSpeciesSex(payload.sex) } : {}),
					...('status' in payload ? { status: readSpeciesStatus(payload.status) } : {}),
					...('identifiedByProfileId' in payload
						? { identifiedByProfileId: readNullableText(payload.identifiedByProfileId) }
						: {}),
					...('identifiedDate' in payload
						? { identifiedDate: readText(payload.identifiedDate) ?? '' }
						: {}),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runCollectionSpeciesCommands(context, options.db, [commandResult.command]);
		},
	);

	app.delete(
		'/adult-surveillance/collection-species/:collectionSpeciesId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				deleteCollectionSpeciesCountCommand({
					...ctx,
					collectionSpeciesId: context.req.param('collectionSpeciesId'),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runCollectionSpeciesCommands(context, options.db, [commandResult.command]);
		},
	);
}

async function runCollectionSpeciesCommands(
	context: CommandContext,
	db: AdultSurveillanceDb,
	commands: readonly AdultSurveillanceCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCollectionSpeciesCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'collection_species_not_found' }, 404);
		}
		return context.json({ collectionSpecies: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeCollectionSpeciesCommands(
	db: AdultSurveillanceDb,
	commands: readonly AdultSurveillanceCommand[],
): Promise<MutationWriteResult<SafeCollectionSpecies | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeCollectionSpecies | null = null;
		for (const command of commands) {
			row = await writeCollectionSpeciesCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeCollectionSpeciesCommand(
	trx: AdultSurveillanceTransaction,
	command: AdultSurveillanceCommand,
): Promise<SafeCollectionSpecies | null> {
	switch (command.type) {
		case 'adultSurveillance.addCollectionSpeciesCount': {
			const row = await trx
				.insertInto('collection_species')
				.values({
					id: command.payload.collectionSpeciesId,
					organization_id: command.payload.organizationId,
					collection_id: command.payload.collectionId,
					species_id: command.payload.speciesId,
					count: command.payload.count,
					sex: command.payload.sex,
					status: command.payload.status,
					identified_by_profile_id: command.payload.identifiedByProfileId,
					identified_date: localDateColumn(command.payload.identifiedDate),
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(collectionSpeciesReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeCollectionSpecies(row);
		}
		case 'adultSurveillance.updateCollectionSpeciesCount': {
			const changes = command.payload.changes;
			const row = await trx
				.updateTable('collection_species')
				.set({
					...('count' in changes ? { count: changes.count } : {}),
					...('speciesId' in changes ? { species_id: changes.speciesId } : {}),
					...('sex' in changes ? { sex: changes.sex ?? null } : {}),
					...('status' in changes ? { status: changes.status ?? null } : {}),
					...('identifiedByProfileId' in changes
						? { identified_by_profile_id: changes.identifiedByProfileId ?? null }
						: {}),
					...('identifiedDate' in changes && changes.identifiedDate !== undefined
						? { identified_date: localDateColumn(changes.identifiedDate) }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.collectionSpeciesId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(collectionSpeciesReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeCollectionSpecies(row);
		}
		case 'adultSurveillance.deleteCollectionSpeciesCount': {
			const row = await trx
				.updateTable('collection_species')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.collectionSpeciesId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(collectionSpeciesReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeCollectionSpecies(row);
		}
		default:
			throw new Error(`Unsupported collection species command: ${command.type}`);
	}
}

// ---------------------------------------------------------------------------
// Geometry + location source resolution
// ---------------------------------------------------------------------------

async function resolveLocationGeom(
	trx: AdultSurveillanceTransaction,
	organizationId: string,
	source: { readonly kind: string } & Record<string, unknown>,
): Promise<ReturnType<typeof geojsonToGeom>> {
	switch (source.kind) {
		case 'geometry':
			return geojsonToGeom(source.geometry);
		case 'address': {
			const row = await trx
				.selectFrom('addresses')
				.select(['geojson'])
				.where('id', '=', source.addressId as string)
				.where('organization_id', '=', organizationId)
				.where('deleted_at', 'is', null)
				.executeTakeFirst();
			if (row === undefined) {
				throw new CommandError(404, { error: 'address_not_found' });
			}
			return geojsonToGeom(row.geojson);
		}
		case 'trap': {
			const snapshot = await loadTrapSnapshot(trx, organizationId, source.trapId as string);
			return geojsonToGeom(snapshot.geojson);
		}
		default:
			throw new CommandError(400, { error: 'unsupported_location_source' });
	}
}

async function loadTrapSnapshot(
	trx: AdultSurveillanceTransaction,
	organizationId: string,
	trapId: string,
): Promise<{
	readonly geojson: unknown;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly addressId: string | null;
}> {
	const row = await trx
		.selectFrom('traps')
		.select(['geojson', 'collection_method_id', 'collection_lure_id', 'address_id'])
		.where('id', '=', trapId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		throw new CommandError(404, { error: 'trap_not_found' });
	}
	return {
		geojson: row.geojson,
		collectionMethodId: row.collection_method_id,
		collectionLureId: row.collection_lure_id,
		addressId: row.address_id,
	};
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
// Timing helpers
// ---------------------------------------------------------------------------

function readCollectionTiming(payload: Record<string, unknown>): CollectionTiming {
	if (payload.collectionTimingMode === 'collection_date_duration') {
		return {
			mode: 'collection_date_duration',
			collectionDate: readText(payload.collectionDate) ?? '',
			durationAmount: readNumber(payload.durationAmount) ?? Number.NaN,
			durationUnitId: readText(payload.durationUnitId) ?? '',
		};
	}
	const startedAt = readDate(payload.startedAt) ?? new Date(Number.NaN);
	const collectedAt = readDate(payload.collectedAt);
	if (collectedAt !== undefined) {
		return { mode: 'exact_timestamps', startedAt, collectedAt };
	}
	return { mode: 'exact_timestamps', startedAt };
}

function hasTimingFields(payload: Record<string, unknown>): boolean {
	return (
		'collectionTimingMode' in payload ||
		'startedAt' in payload ||
		'collectedAt' in payload ||
		'collectionDate' in payload ||
		'durationAmount' in payload ||
		'durationUnitId' in payload
	);
}

function isCollectedTiming(timing: CollectionTiming): boolean {
	return timing.mode === 'collection_date_duration' || 'collectedAt' in timing;
}

function pendingStartedAt(timing: CollectionTiming): Date {
	return timing.mode === 'exact_timestamps' ? timing.startedAt : new Date(Number.NaN);
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

const trapReturnColumns = [
	'id',
	'organization_id',
	'collection_method_id',
	'address_id',
	'collection_lure_id',
	'trap_name',
	'trap_code',
	'description',
	'is_active',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeTrap {
	readonly id: string;
	readonly organizationId: string;
	readonly collectionMethodId: string;
	readonly addressId: string | null;
	readonly collectionLureId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeTrap(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly collection_method_id: string;
	readonly address_id: string | null;
	readonly collection_lure_id: string | null;
	readonly trap_name: string | null;
	readonly trap_code: string | null;
	readonly description: string | null;
	readonly is_active: boolean;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeTrap {
	return {
		id: row.id,
		organizationId: row.organization_id,
		collectionMethodId: row.collection_method_id,
		addressId: row.address_id,
		collectionLureId: row.collection_lure_id,
		trapName: row.trap_name,
		trapCode: row.trap_code,
		description: row.description,
		isActive: row.is_active,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const collectionReturnColumns = [
	'id',
	'organization_id',
	'trap_id',
	'collection_method_id',
	'collection_lure_id',
	'address_id',
	'collected_at',
	'collected_by_profile_id',
	'started_at',
	'set_by_profile_id',
	'collection_timing_mode',
	'collection_date',
	'duration_amount',
	'duration_unit_id',
	'has_problem',
	'is_zero_result',
	'has_bycatch',
	'metadata',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeCollection {
	readonly id: string;
	readonly organizationId: string;
	readonly trapId: string | null;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly addressId: string | null;
	readonly collectedAt: Date | null;
	readonly collectedByProfileId: string | null;
	readonly startedAt: Date | null;
	readonly setByProfileId: string | null;
	readonly collectionTimingMode: string;
	readonly collectionDate: Date | null;
	readonly durationAmount: number | null;
	readonly durationUnitId: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly metadata: unknown | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeCollection(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly trap_id: string | null;
	readonly collection_method_id: string;
	readonly collection_lure_id: string | null;
	readonly address_id: string | null;
	readonly collected_at: Date | null;
	readonly collected_by_profile_id: string | null;
	readonly started_at: Date | null;
	readonly set_by_profile_id: string | null;
	readonly collection_timing_mode: string;
	readonly collection_date: Date | null;
	readonly duration_amount: number | null;
	readonly duration_unit_id: string | null;
	readonly has_problem: boolean;
	readonly is_zero_result: boolean;
	readonly has_bycatch: boolean;
	readonly metadata: unknown | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeCollection {
	return {
		id: row.id,
		organizationId: row.organization_id,
		trapId: row.trap_id,
		collectionMethodId: row.collection_method_id,
		collectionLureId: row.collection_lure_id,
		addressId: row.address_id,
		collectedAt: row.collected_at,
		collectedByProfileId: row.collected_by_profile_id,
		startedAt: row.started_at,
		setByProfileId: row.set_by_profile_id,
		collectionTimingMode: row.collection_timing_mode,
		collectionDate: row.collection_date,
		durationAmount: row.duration_amount,
		durationUnitId: row.duration_unit_id,
		hasProblem: row.has_problem,
		isZeroResult: row.is_zero_result,
		hasBycatch: row.has_bycatch,
		metadata: row.metadata,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const collectionSpeciesReturnColumns = [
	'id',
	'organization_id',
	'collection_id',
	'species_id',
	'count',
	'sex',
	'status',
	'identified_by_profile_id',
	'identified_date',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeCollectionSpecies {
	readonly id: string;
	readonly organizationId: string;
	readonly collectionId: string;
	readonly speciesId: string;
	readonly count: number;
	readonly sex: string | null;
	readonly status: string | null;
	readonly identifiedByProfileId: string | null;
	readonly identifiedDate: Date;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeCollectionSpecies(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly collection_id: string;
	readonly species_id: string;
	readonly count: number;
	readonly sex: string | null;
	readonly status: string | null;
	readonly identified_by_profile_id: string | null;
	readonly identified_date: Date;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeCollectionSpecies {
	return {
		id: row.id,
		organizationId: row.organization_id,
		collectionId: row.collection_id,
		speciesId: row.species_id,
		count: row.count,
		sex: row.sex,
		status: row.status,
		identifiedByProfileId: row.identified_by_profile_id,
		identifiedDate: row.identified_date,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ---------------------------------------------------------------------------
// Shared command + request helpers
// ---------------------------------------------------------------------------

type CommandContext = Context<{ Variables: AuthVariables }>;

type TrapUpdateColumns = {
	geom?: ReturnType<typeof geojsonToGeom>;
	collection_method_id?: string;
	address_id?: string | null;
	collection_lure_id?: string | null;
	trap_name?: string | null;
	trap_code?: string | null;
	description?: string | null;
	is_active?: boolean;
	updated_by_profile_id: string;
};

type CollectionTimingColumns = {
	collection_timing_mode: 'exact_timestamps' | 'collection_date_duration';
	started_at: Date | null;
	collected_at: Date | null;
	collection_date: ReturnType<typeof localDateColumn> | null;
	duration_amount: number | null;
	duration_unit_id: string | null;
};

type CollectionUpdateColumns = {
	geom?: ReturnType<typeof geojsonToGeom>;
	collection_method_id?: string;
	collection_lure_id?: string | null;
	address_id?: string | null;
	collected_at?: Date | null;
	collected_by_profile_id?: string | null;
	set_by_profile_id?: string | null;
	has_problem?: boolean;
	is_zero_result?: boolean;
	has_bycatch?: boolean;
	metadata?: unknown | null;
	updated_by_profile_id: string;
} & Partial<CollectionTimingColumns>;

interface CollectionInsertInput {
	readonly id: string;
	readonly organizationId: string;
	readonly geom: ReturnType<typeof geojsonToGeom>;
	readonly trapId: string | null;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly addressId: string | null;
	readonly timing: CollectionTiming;
	readonly setByProfileId: string | null;
	readonly collectedByProfileId: string | null;
	readonly hasProblem: boolean;
	readonly metadata: unknown | null;
	readonly actorProfileId: string;
}

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

function createCommand<TCommand extends AdultSurveillanceCommand>(
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

async function readCurrentTransactionId(trx: AdultSurveillanceTransaction): Promise<number> {
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

function readDate(value: unknown): Date | undefined {
	if (typeof value !== 'string' && !(value instanceof Date)) {
		return undefined;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function readSpeciesSex(value: unknown): 'male' | 'female' | null {
	return value === 'male' || value === 'female' ? value : null;
}

function readSpeciesStatus(value: unknown): 'damaged' | 'unfed' | 'bloodfed' | 'gravid' | null {
	return value === 'damaged' || value === 'unfed' || value === 'bloodfed' || value === 'gravid'
		? value
		: null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
