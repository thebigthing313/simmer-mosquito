import {
	applyRecordDeletion,
	assertWriteReferences,
	checkedValues,
	sql,
} from '@simmer-mosquito/db';
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
import { readNullableText, readText } from '../command-payload.js';
import {
	type AdultSurveillanceDb,
	type AdultSurveillanceTransaction,
	agencyCommandContext,
	type CommandContext,
	commandEndpoint,
	createCommand,
	type InvalidCommandBody,
	invalidUpdate,
	resolveLocationGeom,
	runCommands,
	surveillanceCatalogReferences,
	type TrapRow,
	type TrapUpdateColumns,
	trapReturnColumns,
	updateRow,
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
	app.post(
		'/adult-surveillance/traps',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createTrapCommand({
					...ctx,
					trapId: readText(payload.id) ?? '',
					locationSource: payload.locationSource as TrapLocationSourceInput,
					collectionMethodId: readText(payload.collectionMethodId) ?? '',
					addressId: readNullableText(payload.addressId),
					collectionLureId: readNullableText(payload.collectionLureId),
					trapName: readNullableText(payload.trapName),
					trapCode: readNullableText(payload.trapCode),
					description: readNullableText(payload.description),
					acknowledgedDuplicateTrapCode: payload.acknowledgedDuplicateTrapCode === true,
				}),
			run: (context, commands) => runTrapCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/adult-surveillance/traps/:trapId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildTrapUpdateCommands(authContext, param('trapId'), payload),
			run: (context, commands) => runTrapCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/adult-surveillance/traps/:trapId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'optional',
			build: ({ payload, agency: ctx, param }) =>
				deleteTrapCommand({
					...ctx,
					trapId: param('trapId'),
					acknowledgedCascadeDelete: payload.acknowledgedCascadeDelete !== false,
				}),
			run: (context, commands) => runTrapCommands(context, options.db, commands),
		}),
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
	return runCommands(
		context,
		{ db, write: writeTrapCommand, notFound: 'trap_not_found', key: 'trap' },
		commands,
		createdStatus,
	);
}

/** Exported for `table-commands/traps.ts` — see `writeHabitatCommand`. */
export async function writeTrapCommand(
	trx: AdultSurveillanceTransaction,
	command: AdultSurveillanceCommand,
): Promise<TrapRow | null> {
	switch (command.type) {
		case 'adultSurveillance.createTrap': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: surveillanceCatalogReferences(command.payload),
			});
			const row = await trx
				.insertInto('traps')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
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
					}),
				)
				.returning(trapReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
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
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'update', table: 'traps', recordId: command.payload.trapId },
				references: surveillanceCatalogReferences(command.payload.changes),
			});
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
			return row ?? null;
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
): Promise<TrapRow | null> {
	return updateRow(trx, 'traps', trapId, organizationId, set, trapReturnColumns);
}
