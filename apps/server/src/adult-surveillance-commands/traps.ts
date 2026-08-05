import { applyRecordDeletion, type MutationWriteResult, sql } from '@simmer-mosquito/db';
import {
	type AdultSurveillanceCommand,
	createTrapCommand,
	deleteTrapCommand,
	reactivateTrapCommand,
	retireTrapCommand,
	type TrapLocationSourceInput,
	updateTrapConfigurationCommand,
	updateTrapDetailsCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	type AdultSurveillanceDb,
	type AdultSurveillanceTransaction,
	agencyCommandContext,
	type CommandContext,
	createCommand,
	handleCommandError,
	type InvalidCommandBody,
	invalidUpdate,
	readCurrentTransactionId,
	readJsonObject,
	readNullableText,
	readOptionalJsonObject,
	readText,
	resolveLocationGeom,
	type SafeTrap,
	type TrapUpdateColumns,
	toSafeTrap,
	trapReturnColumns,
} from './shared.js';

// ---------------------------------------------------------------------------
// Traps
// ---------------------------------------------------------------------------

export function registerTrapRoutes(
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
	const denial = denyUnauthorizedAgencyCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

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
			await applyRecordDeletion(trx, {
				recordType: 'trap',
				recordId: command.payload.trapId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
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
