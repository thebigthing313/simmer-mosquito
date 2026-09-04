import {
	applyRecordDeletion,
	applyRecordMerge,
	assertClearanceAcknowledged,
	assertWriteReferences,
	checkedValues,
	softDelete,
	sql,
} from '@simmer-mosquito/db';
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
import { CommandError } from '../command-endpoint.js';
import { acknowledged, readNullableText, readText } from '../command-payload.js';
import {
	agencyCommandContext,
	type CommandContext,
	commandEndpoint,
	createCommand,
	geojsonToGeom,
	type HabitatRow,
	type HabitatUpdateColumns,
	habitatReturnColumns,
	habitatTypeReferences,
	type InvalidCommandBody,
	invalidUpdate,
	type LarvalSurveillanceDb,
	type LarvalSurveillanceTransaction,
	resolveLocationGeom,
	runCommands,
	updateRow,
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
	app.post(
		'/larval-surveillance/habitats',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) => {
				const inspectionId = readNullableText(payload.inspectionId);
				return inspectionId !== null && payload.locationSource === undefined
					? createHabitatFromInspectionCommand({
							...ctx,
							habitatId: readText(payload.id) ?? '',
							inspectionId,
							habitatName: readNullableText(payload.habitatName),
							description: readText(payload.description) ?? '',
							metadata: payload.metadata ?? null,
						})
					: createHabitatCommand({
							...ctx,
							habitatId: readText(payload.id) ?? '',
							locationSource: payload.locationSource as never,
							addressId: readNullableText(payload.addressId),
							habitatTypeId: readNullableText(payload.habitatTypeId),
							habitatName: readNullableText(payload.habitatName),
							description: readText(payload.description) ?? '',
							metadata: payload.metadata ?? null,
						});
			},
			run: (context, commands) => runHabitatCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/larval-surveillance/habitats/:habitatId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildHabitatUpdateCommands(authContext, param('habitatId'), payload),
			run: (context, commands) => runHabitatCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/larval-surveillance/habitats/:habitatId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'optional',
			build: ({ payload, agency: ctx, param }) =>
				deleteHabitatCommand({
					...ctx,
					habitatId: param('habitatId'),
					acknowledgedHabitatDelete: acknowledged(payload, 'acknowledgedHabitatDelete'),
					acknowledgedInspectionDetach: acknowledged(payload, 'acknowledgedInspectionDetach'),
					acknowledgedCrossDomainDetach: acknowledged(payload, 'acknowledgedCrossDomainDetach'),
				}),
			run: (context, commands) => runHabitatCommands(context, options.db, commands),
		}),
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
				acknowledgedHabitatLocationSemanticsChange: acknowledged(
					payload,
					'acknowledgedHabitatLocationSemanticsChange',
				),
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
				acknowledgedHabitatConfigurationSemanticsChange: acknowledged(
					payload,
					'acknowledgedHabitatConfigurationSemanticsChange',
				),
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
				: retireHabitatCommand({
						...ctx,
						habitatId,
						acknowledgedRouteRemoval: acknowledged(payload, 'acknowledgedRouteRemoval'),
					}),
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
	return runCommands(
		context,
		{ db, write: writeHabitatCommand, notFound: 'habitat_not_found', key: 'habitat' },
		commands,
		createdStatus,
	);
}

/**
 * Exported for `table-commands/habitats.ts`, which reaches the same ten commands
 * through `/commands/habitats` and needs the writer unchanged — only the route
 * and how the command is chosen differ.
 */
export async function writeHabitatCommand(
	trx: LarvalSurveillanceTransaction,
	command: LarvalSurveillanceCommand,
): Promise<HabitatRow | null> {
	switch (command.type) {
		case 'larvalSurveillance.createHabitat': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: habitatTypeReferences(command.payload),
			});
			const row = await trx
				.insertInto('habitats')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
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
					}),
				)
				.returning(habitatReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'larvalSurveillance.createHabitatFromInspection': {
			// The habitat type here is copied from the Habitat being inspected, not
			// chosen by the person recording. The gate is about starting to use a
			// retired catalog row; refusing an inherited one would make a Habitat
			// uninspectable because its type was deactivated after it was built.
			const snapshot = await loadInspectionSnapshot(
				trx,
				command.payload.organizationId,
				command.payload.inspectionId,
			);
			const habitat = await trx
				.insertInto('habitats')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
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
					}),
				)
				.returning(habitatReturnColumns)
				.executeTakeFirstOrThrow();
			await updateRow(
				trx,
				'inspections',
				command.payload.inspectionId,
				command.payload.organizationId,
				{ habitat_id: command.payload.habitatId },
				['id'],
			);
			return habitat;
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
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'update', table: 'habitats', recordId: command.payload.habitatId },
				references: habitatTypeReferences(command.payload.changes),
			});
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
		case 'larvalSurveillance.retireHabitat': {
			// Retiring takes the habitat off its routes, which is a row set going
			// away without a record being deleted, so it is a clearance rather than
			// anything the delete registry describes. Counted first: a habitat on no
			// route retires without a question.
			const routeItems = sql`entity_type = 'habitat'
				and entity_id = ${command.payload.habitatId}
				and organization_id = ${command.payload.organizationId}
				and deleted_at is null`;
			await assertClearanceAcknowledged(trx, {
				acknowledgement: 'acknowledgedRouteRemoval',
				acknowledged: command.payload.acknowledgedRouteRemoval,
				rules: [
					{
						key: 'habitatRouteItems',
						table: 'route_items',
						singular: 'route stop',
						plural: 'route stops',
						match: routeItems,
					},
				],
			});
			await sql`
				update route_items
				set deleted_at = now(),
					deleted_by_profile_id = ${command.payload.actorProfileId},
					updated_by_profile_id = ${command.payload.actorProfileId},
					updated_at = now()
				where ${routeItems}
			`.execute(trx);
			return updateHabitat(trx, command.payload.habitatId, command.payload.organizationId, {
				is_active: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		}
		case 'larvalSurveillance.reactivateHabitat':
			return updateHabitat(trx, command.payload.habitatId, command.payload.organizationId, {
				is_active: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.mergeHabitats': {
			// Re-point first, retire second: every rule finds its rows by the source
			// habitat id, and a source already soft-deleted is not one of them.
			//
			// The route and assignment stops are the part worth knowing about. Two
			// habitats on one route are two stops; merged, they are one place, and
			// `applyRecordMerge` keeps the *target's* existing stop so the crew's
			// position and directions to the next stop survive, retiring the source's.
			await applyRecordMerge(trx, {
				recordType: 'habitat',
				targetId: command.payload.targetHabitatId,
				sourceIds: command.payload.sourceHabitatIds,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			for (const sourceId of command.payload.sourceHabitatIds) {
				await softDelete(
					trx,
					'habitats',
					sourceId,
					command.payload.organizationId,
					command.payload.actorProfileId,
					habitatReturnColumns,
				);
			}
			// The survivor, unchanged: a merge picks which habitat is authoritative
			// and does not blend the retired ones' name, geometry, address or type
			// into it.
			const row = await trx
				.selectFrom('habitats')
				.select(habitatReturnColumns)
				.where('id', '=', command.payload.targetHabitatId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.executeTakeFirst();
			return row ?? null;
		}
		case 'larvalSurveillance.deleteHabitat': {
			await applyRecordDeletion(trx, {
				recordType: 'habitat',
				recordId: command.payload.habitatId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedInspectionDetach: command.payload.acknowledgedInspectionDetach,
					acknowledgedCrossDomainDetach: command.payload.acknowledgedCrossDomainDetach,
				},
			});
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
			return row ?? null;
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
): Promise<HabitatRow | null> {
	return updateRow(trx, 'habitats', habitatId, organizationId, set, habitatReturnColumns);
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
