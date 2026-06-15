import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	activateFormulationCommand,
	addChemicalApplicationBatchCommand,
	addFormulationInsecticideCommand,
	type ControlActionContext,
	type ControlActionLocationSourceInput,
	type ControlOperationsCommand,
	createFormulationCommand,
	DomainValidationError,
	deactivateFormulationCommand,
	deleteBiocontrolActionCommand,
	deleteChemicalApplicationCommand,
	deleteFormulationCommand,
	deleteOutreachActionCommand,
	deleteRequestedControlActionCommand,
	deleteSourceReductionCommand,
	type RequestedControlActionLocationSourceInput,
	recordBiocontrolActionCommand,
	recordChemicalApplicationCommand,
	recordOutreachActionCommand,
	recordSourceReductionCommand,
	removeChemicalApplicationBatchCommand,
	removeFormulationInsecticideCommand,
	reopenRequestedControlActionCommand,
	requestControlActionCommand,
	resolveRequestedControlActionCommand,
	updateBiocontrolActionFieldDetailsCommand,
	updateBiocontrolActionLocationAndContextCommand,
	updateChemicalApplicationFieldDetailsCommand,
	updateChemicalApplicationLocationAndContextCommand,
	updateFormulationDetailsCommand,
	updateFormulationInsecticideCommand,
	updateOutreachActionFieldDetailsCommand,
	updateOutreachActionLocationAndContextCommand,
	updateRequestedControlActionDetailsCommand,
	updateRequestedControlActionLocationAndContextCommand,
	updateSourceReductionFieldDetailsCommand,
	updateSourceReductionLocationAndContextCommand,
} from '@simmer-mosquito/domain';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';

type ControlOperationsDb = Kysely<SimmerDatabase>;
type ControlOperationsTransaction = Transaction<SimmerDatabase>;
type CommandContext = Context<{ Variables: AuthVariables }>;

/**
 * Control operations command endpoints: formulations + formulation insecticides,
 * the four performed control-action types (chemical application, source
 * reduction, outreach, biocontrol) plus chemical-application batches, and
 * requested control actions.
 *
 * As with the surveillance slices the client issues plain optimistic
 * POST/PATCH/DELETE per row; the server decomposes each into the rich
 * control-operations domain command vocabulary. The domain `ControlActionContext`
 * (none/larval/adult) maps onto the habitat/inspection/collection columns.
 */
export function registerControlOperationsCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: ControlOperationsDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	registerFormulationRoutes(app, options);
	registerFormulationInsecticideRoutes(app, options);
	registerApplicationRoutes(app, options);
	registerApplicationBatchRoutes(app, options);
	registerActionRoutes(app, options, sourceReductionConfig);
	registerActionRoutes(app, options, outreachActionConfig);
	registerActionRoutes(app, options, biocontrolActionConfig);
	registerRequestedControlActionRoutes(app, options);
}

// ===========================================================================
// Formulations
// ===========================================================================

function registerFormulationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/control-operations/formulations', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const diluentRatio = readNumber(raw.payload.diluentRatio);
		const result = createCommand(() =>
			createFormulationCommand({
				...ctx,
				formulationId: readText(raw.payload.id) ?? '',
				formulationName: readText(raw.payload.formulationName) ?? '',
				description: readNullableText(raw.payload.description),
				...(diluentRatio !== undefined ? { diluentRatio } : {}),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runFormulationCommands(context, options.db, [result.command], 201);
	});

	app.patch(
		'/control-operations/formulations/:formulationId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = buildFormulationUpdateCommands(
				context.get('authContext'),
				context.req.param('formulationId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runFormulationCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/control-operations/formulations/:formulationId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteFormulationCommand({
					...ctx,
					formulationId: context.req.param('formulationId'),
					acknowledgedComponentDeletion: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runFormulationCommands(context, options.db, [result.command]);
		},
	);
}

function buildFormulationUpdateCommands(
	authContext: AuthContext,
	formulationId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: ControlOperationsCommand[] = [];

	const hasName = 'formulationName' in payload;
	const hasDescription = 'description' in payload;
	const hasDiluent = 'diluentRatio' in payload;
	if (hasName || hasDescription || hasDiluent) {
		const result = createCommand(() =>
			updateFormulationDetailsCommand({
				...ctx,
				formulationId,
				...(hasName ? { formulationName: readText(payload.formulationName) ?? '' } : {}),
				...(hasDescription ? { description: readNullableText(payload.description) } : {}),
				...(hasDiluent ? { diluentRatio: readNumber(payload.diluentRatio) ?? Number.NaN } : {}),
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
				? activateFormulationCommand({ ...ctx, formulationId })
				: deactivateFormulationCommand({ ...ctx, formulationId }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('formulation');
	}
	return { ok: true, commands };
}

async function runFormulationCommands(
	context: CommandContext,
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeFormulationCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'formulation_not_found' }, 404);
		}
		return context.json({ formulation: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeFormulationCommands(
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
): Promise<MutationWriteResult<SafeFormulation | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeFormulation | null = null;
		for (const command of commands) {
			row = await writeFormulationCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeFormulationCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeFormulation | null> {
	switch (command.type) {
		case 'controlOperations.createFormulation': {
			const row = await trx
				.insertInto('formulations')
				.values({
					id: command.payload.formulationId,
					organization_id: command.payload.organizationId,
					formulation_name: command.payload.formulationName,
					description: command.payload.description,
					diluent_ratio: command.payload.diluentRatio,
					is_active: true,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(formulationReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeFormulation(row);
		}
		case 'controlOperations.updateFormulationDetails':
			return updateFormulation(trx, command.payload.formulationId, command.payload.organizationId, {
				...('formulationName' in command.payload.changes
					? { formulation_name: command.payload.changes.formulationName }
					: {}),
				...('description' in command.payload.changes
					? { description: command.payload.changes.description ?? null }
					: {}),
				...('diluentRatio' in command.payload.changes
					? { diluent_ratio: command.payload.changes.diluentRatio }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.activateFormulation':
			return updateFormulation(trx, command.payload.formulationId, command.payload.organizationId, {
				is_active: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateFormulation':
			return updateFormulation(trx, command.payload.formulationId, command.payload.organizationId, {
				is_active: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.deleteFormulation':
			return softDelete(
				trx,
				'formulations',
				command.payload.formulationId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				formulationReturnColumns,
				toSafeFormulation,
			);
		default:
			throw new Error(`Unsupported formulation command: ${command.type}`);
	}
}

async function updateFormulation(
	trx: ControlOperationsTransaction,
	formulationId: string,
	organizationId: string,
	set: FormulationUpdateColumns,
): Promise<SafeFormulation | null> {
	const row = await trx
		.updateTable('formulations')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', formulationId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(formulationReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeFormulation(row);
}

// ===========================================================================
// Formulation insecticides
// ===========================================================================

function registerFormulationInsecticideRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/control-operations/formulation-insecticides',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				addFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: readText(raw.payload.id) ?? '',
					formulationId: readText(raw.payload.formulationId) ?? '',
					insecticideId: readText(raw.payload.insecticideId) ?? '',
					ratio: readNumber(raw.payload.ratio) ?? Number.NaN,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runFormulationInsecticideCommands(context, options.db, [result.command], 201);
		},
	);

	app.patch(
		'/control-operations/formulation-insecticides/:formulationInsecticideId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const payload = raw.payload;
			const result = createCommand(() =>
				updateFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: context.req.param('formulationInsecticideId'),
					...('insecticideId' in payload
						? { insecticideId: readText(payload.insecticideId) ?? '' }
						: {}),
					...('ratio' in payload ? { ratio: readNumber(payload.ratio) ?? Number.NaN } : {}),
					acknowledgedDeactivateEmptyFormulation: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runFormulationInsecticideCommands(context, options.db, [result.command]);
		},
	);

	app.delete(
		'/control-operations/formulation-insecticides/:formulationInsecticideId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				removeFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: context.req.param('formulationInsecticideId'),
					acknowledgedDeactivateEmptyFormulation: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runFormulationInsecticideCommands(context, options.db, [result.command]);
		},
	);
}

async function runFormulationInsecticideCommands(
	context: CommandContext,
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeFormulationInsecticideCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'formulation_insecticide_not_found' }, 404);
		}
		return context.json(
			{ formulationInsecticide: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeFormulationInsecticideCommands(
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
): Promise<MutationWriteResult<SafeFormulationInsecticide | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeFormulationInsecticide | null = null;
		for (const command of commands) {
			row = await writeFormulationInsecticideCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeFormulationInsecticideCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeFormulationInsecticide | null> {
	switch (command.type) {
		case 'controlOperations.addFormulationInsecticide': {
			const row = await trx
				.insertInto('formulation_insecticides')
				.values({
					id: command.payload.formulationInsecticideId,
					organization_id: command.payload.organizationId,
					formulation_id: command.payload.formulationId,
					insecticide_id: command.payload.insecticideId,
					ratio: command.payload.ratio,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(formulationInsecticideReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeFormulationInsecticide(row);
		}
		case 'controlOperations.updateFormulationInsecticide': {
			const row = await trx
				.updateTable('formulation_insecticides')
				.set({
					...('insecticideId' in command.payload.changes
						? { insecticide_id: command.payload.changes.insecticideId }
						: {}),
					...('ratio' in command.payload.changes ? { ratio: command.payload.changes.ratio } : {}),
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.formulationInsecticideId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(formulationInsecticideReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeFormulationInsecticide(row);
		}
		case 'controlOperations.removeFormulationInsecticide':
			return softDelete(
				trx,
				'formulation_insecticides',
				command.payload.formulationInsecticideId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				formulationInsecticideReturnColumns,
				toSafeFormulationInsecticide,
			);
		default:
			throw new Error(`Unsupported formulation insecticide command: ${command.type}`);
	}
}

// ===========================================================================
// Chemical applications
// ===========================================================================

function registerApplicationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/control-operations/applications', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const p = raw.payload;
		const result = createCommand(() =>
			recordChemicalApplicationCommand({
				...ctx,
				applicationId: readText(p.id) ?? '',
				insecticideId: readText(p.insecticideId) ?? '',
				amountApplied: readNumber(p.amountApplied) ?? Number.NaN,
				applicationUnitId: readText(p.applicationUnitId) ?? '',
				applicationDate: readText(p.applicationDate) ?? '',
				applicatorProfileId: readNullableText(p.applicatorProfileId),
				locationSource: p.locationSource as ControlActionLocationSourceInput,
				addressId: readNullableText(p.addressId),
				context: readControlActionContext(p),
				requestedControlActionId: readNullableText(p.requestedControlActionId),
				applicationMethodId: readNullableText(p.applicationMethodId),
				vehicleId: readNullableText(p.vehicleId),
				equipmentId: readNullableText(p.equipmentId),
				metadata: p.metadata ?? null,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runApplicationCommands(context, options.db, [result.command], 201);
	});

	app.patch(
		'/control-operations/applications/:applicationId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = buildApplicationUpdateCommands(
				context.get('authContext'),
				context.req.param('applicationId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runApplicationCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/control-operations/applications/:applicationId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteChemicalApplicationCommand({
					...ctx,
					applicationId: context.req.param('applicationId'),
					acknowledgedSupportRecordDeletion: true,
					acknowledgedBatchDeletion: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runApplicationCommands(context, options.db, [result.command]);
		},
	);
}

function buildApplicationUpdateCommands(
	authContext: AuthContext,
	applicationId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: ControlOperationsCommand[] = [];

	const fieldKeys = [
		'applicationDate',
		'applicatorProfileId',
		'applicationMethodId',
		'insecticideId',
		'amountApplied',
		'applicationUnitId',
		'vehicleId',
		'equipmentId',
		'metadata',
	];
	if (fieldKeys.some((key) => key in payload)) {
		const result = createCommand(() =>
			updateChemicalApplicationFieldDetailsCommand({
				...ctx,
				applicationId,
				...('applicationDate' in payload
					? { applicationDate: readText(payload.applicationDate) ?? '' }
					: {}),
				...('applicatorProfileId' in payload
					? { applicatorProfileId: readNullableText(payload.applicatorProfileId) }
					: {}),
				...('applicationMethodId' in payload
					? { applicationMethodId: readNullableText(payload.applicationMethodId) }
					: {}),
				...('insecticideId' in payload
					? { insecticideId: readText(payload.insecticideId) ?? '' }
					: {}),
				...('amountApplied' in payload
					? { amountApplied: readNumber(payload.amountApplied) ?? Number.NaN }
					: {}),
				...('applicationUnitId' in payload
					? { applicationUnitId: readText(payload.applicationUnitId) ?? '' }
					: {}),
				...('vehicleId' in payload ? { vehicleId: readNullableText(payload.vehicleId) } : {}),
				...('equipmentId' in payload ? { equipmentId: readNullableText(payload.equipmentId) } : {}),
				...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
				acknowledgedBatchClearance: true,
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (hasLocationContextChange(payload)) {
		const result = createCommand(() =>
			updateChemicalApplicationLocationAndContextCommand({
				...ctx,
				applicationId,
				...locationContextInput(payload),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('application');
	}
	return { ok: true, commands };
}

async function runApplicationCommands(
	context: CommandContext,
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeApplicationCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'application_not_found' }, 404);
		}
		return context.json({ application: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeApplicationCommands(
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
): Promise<MutationWriteResult<SafeApplication | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeApplication | null = null;
		for (const command of commands) {
			row = await writeApplicationCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeApplicationCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeApplication | null> {
	switch (command.type) {
		case 'controlOperations.recordChemicalApplication': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('applications')
				.values({
					id: command.payload.applicationId,
					organization_id: command.payload.organizationId,
					application_method_id: command.payload.applicationMethodId,
					insecticide_id: command.payload.insecticideId,
					applicator_profile_id: command.payload.applicatorProfileId,
					application_date: localDateColumn(command.payload.applicationDate),
					geom: await resolveGeom(
						trx,
						command.payload.organizationId,
						command.payload.locationSource,
					),
					address_id: command.payload.addressId,
					vehicle_id: command.payload.vehicleId,
					equipment_id: command.payload.equipmentId,
					amount_applied: command.payload.amountApplied,
					application_unit_id: command.payload.applicationUnitId,
					habitat_id: ids.habitatId,
					collection_id: ids.collectionId,
					inspection_id: ids.inspectionId,
					requested_control_action_id: command.payload.requestedControlActionId,
					metadata: command.payload.metadata,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(applicationReturnColumns)
				.executeTakeFirstOrThrow();
			for (const batch of command.payload.applicationBatches) {
				await insertApplicationBatch(trx, {
					id: batch.applicationBatchId,
					organizationId: command.payload.organizationId,
					applicationId: command.payload.applicationId,
					insecticideBatchId: batch.insecticideBatchId,
					actorProfileId: command.payload.actorProfileId,
				});
			}
			return toSafeApplication(row);
		}
		case 'controlOperations.updateChemicalApplicationFieldDetails': {
			const changes = command.payload.changes;
			return updateApplication(trx, command.payload.applicationId, command.payload.organizationId, {
				...('applicationDate' in changes && changes.applicationDate !== undefined
					? { application_date: localDateColumn(changes.applicationDate) }
					: {}),
				...('applicatorProfileId' in changes
					? { applicator_profile_id: changes.applicatorProfileId ?? null }
					: {}),
				...('applicationMethodId' in changes
					? { application_method_id: changes.applicationMethodId ?? null }
					: {}),
				...('insecticideId' in changes ? { insecticide_id: changes.insecticideId } : {}),
				...('amountApplied' in changes ? { amount_applied: changes.amountApplied } : {}),
				...('applicationUnitId' in changes
					? { application_unit_id: changes.applicationUnitId }
					: {}),
				...('vehicleId' in changes ? { vehicle_id: changes.vehicleId ?? null } : {}),
				...('equipmentId' in changes ? { equipment_id: changes.equipmentId ?? null } : {}),
				...('metadata' in changes ? { metadata: changes.metadata ?? null } : {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		}
		case 'controlOperations.updateChemicalApplicationLocationAndContext':
			return updateApplication(trx, command.payload.applicationId, command.payload.organizationId, {
				...(await locationContextColumns(
					trx,
					command.payload.organizationId,
					command.payload.changes,
					{
						collection: true,
					},
				)),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.deleteChemicalApplication':
			return softDelete(
				trx,
				'applications',
				command.payload.applicationId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				applicationReturnColumns,
				toSafeApplication,
			);
		default:
			throw new Error(`Unsupported application command: ${command.type}`);
	}
}

async function updateApplication(
	trx: ControlOperationsTransaction,
	applicationId: string,
	organizationId: string,
	set: ApplicationUpdateColumns,
): Promise<SafeApplication | null> {
	const row = await trx
		.updateTable('applications')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', applicationId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(applicationReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeApplication(row);
}

// ===========================================================================
// Chemical application batches
// ===========================================================================

function registerApplicationBatchRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/control-operations/application-batches',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				addChemicalApplicationBatchCommand({
					...ctx,
					applicationBatchId: readText(raw.payload.id) ?? '',
					applicationId: readText(raw.payload.applicationId) ?? '',
					insecticideBatchId: readText(raw.payload.insecticideBatchId) ?? '',
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runApplicationBatchCommands(context, options.db, [result.command], 201);
		},
	);

	app.delete(
		'/control-operations/application-batches/:applicationBatchId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				removeChemicalApplicationBatchCommand({
					...ctx,
					applicationBatchId: context.req.param('applicationBatchId'),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runApplicationBatchCommands(context, options.db, [result.command]);
		},
	);
}

async function runApplicationBatchCommands(
	context: CommandContext,
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeApplicationBatchCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'application_batch_not_found' }, 404);
		}
		return context.json({ applicationBatch: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeApplicationBatchCommands(
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
): Promise<MutationWriteResult<SafeApplicationBatch | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeApplicationBatch | null = null;
		for (const command of commands) {
			if (command.type === 'controlOperations.addChemicalApplicationBatch') {
				row = await insertApplicationBatch(trx, {
					id: command.payload.applicationBatchId,
					organizationId: command.payload.organizationId,
					applicationId: command.payload.applicationId,
					insecticideBatchId: command.payload.insecticideBatchId,
					actorProfileId: command.payload.actorProfileId,
				});
			} else if (command.type === 'controlOperations.removeChemicalApplicationBatch') {
				row = await softDelete(
					trx,
					'application_batches',
					command.payload.applicationBatchId,
					command.payload.organizationId,
					command.payload.actorProfileId,
					applicationBatchReturnColumns,
					toSafeApplicationBatch,
				);
			} else {
				throw new Error(`Unsupported application batch command: ${command.type}`);
			}
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function insertApplicationBatch(
	trx: ControlOperationsTransaction,
	input: {
		readonly id: string;
		readonly organizationId: string;
		readonly applicationId: string;
		readonly insecticideBatchId: string;
		readonly actorProfileId: string;
	},
): Promise<SafeApplicationBatch> {
	const row = await trx
		.insertInto('application_batches')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			application_id: input.applicationId,
			insecticide_batch_id: input.insecticideBatchId,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(applicationBatchReturnColumns)
		.executeTakeFirstOrThrow();
	return toSafeApplicationBatch(row);
}

// ===========================================================================
// Source reduction / outreach / biocontrol actions (shared shape)
// ===========================================================================

interface ActionConfig<TSafe> {
	readonly noun: string;
	readonly basePath: string;
	readonly notFoundError: string;
	readonly idParam: string;
	readonly buildCreate: (
		ctx: AgencyContext,
		payload: Record<string, unknown>,
	) => ControlOperationsCommand;
	readonly buildUpdate: (
		ctx: AgencyContext,
		id: string,
		payload: Record<string, unknown>,
	) => CommandsResult;
	readonly buildDelete: (ctx: AgencyContext, id: string) => ControlOperationsCommand;
	readonly write: (
		db: ControlOperationsDb,
		commands: readonly ControlOperationsCommand[],
	) => Promise<MutationWriteResult<TSafe | null>>;
	readonly responseKey: string;
}

function registerActionRoutes<TSafe>(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
	config: ActionConfig<TSafe>,
): void {
	app.post(config.basePath, options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const result = createCommand(() =>
			config.buildCreate(agencyCommandContext(context.get('authContext')), raw.payload),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runActionCommands(context, options.db, config, [result.command], 201);
	});

	app.patch(
		`${config.basePath}/:${config.idParam}`,
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = config.buildUpdate(
				agencyCommandContext(context.get('authContext')),
				context.req.param(config.idParam),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runActionCommands(context, options.db, config, commandsResult.commands);
		},
	);

	app.delete(
		`${config.basePath}/:${config.idParam}`,
		options.authContextMiddleware,
		async (context) => {
			const result = createCommand(() =>
				config.buildDelete(
					agencyCommandContext(context.get('authContext')),
					context.req.param(config.idParam),
				),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runActionCommands(context, options.db, config, [result.command]);
		},
	);
}

async function runActionCommands<TSafe>(
	context: CommandContext,
	db: ControlOperationsDb,
	config: ActionConfig<TSafe>,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await config.write(db, commands);
		if (result.row === null) {
			return context.json({ error: config.notFoundError }, 404);
		}
		return context.json(
			{ [config.responseKey]: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

// --- Source reductions ---

const sourceReductionConfig: ActionConfig<SafeSourceReduction> = {
	noun: 'source reduction',
	basePath: '/control-operations/source-reductions',
	notFoundError: 'source_reduction_not_found',
	idParam: 'sourceReductionId',
	responseKey: 'sourceReduction',
	buildCreate: (ctx, p) =>
		recordSourceReductionCommand({
			...ctx,
			sourceReductionId: readText(p.id) ?? '',
			sourceReductionMethodId: readText(p.sourceReductionMethodId) ?? '',
			technicianProfileId: readNullableText(p.technicianProfileId),
			sourceReductionDate: readText(p.sourceReductionDate) ?? '',
			sourcesEliminatedAmount: readNumber(p.sourcesEliminatedAmount) ?? Number.NaN,
			sourcesEliminatedUnitId: readText(p.sourcesEliminatedUnitId) ?? '',
			locationSource: p.locationSource as ControlActionLocationSourceInput,
			addressId: readNullableText(p.addressId),
			context: readControlActionContext(p),
			requestedControlActionId: readNullableText(p.requestedControlActionId),
			metadata: p.metadata ?? null,
		}),
	buildUpdate: (ctx, id, payload) => {
		const commands: ControlOperationsCommand[] = [];
		const fieldKeys = [
			'sourceReductionDate',
			'technicianProfileId',
			'sourceReductionMethodId',
			'sourcesEliminatedAmount',
			'sourcesEliminatedUnitId',
			'metadata',
		];
		if (fieldKeys.some((key) => key in payload)) {
			const result = createCommand(() =>
				updateSourceReductionFieldDetailsCommand({
					...ctx,
					sourceReductionId: id,
					...('sourceReductionDate' in payload
						? { sourceReductionDate: readText(payload.sourceReductionDate) ?? '' }
						: {}),
					...('technicianProfileId' in payload
						? { technicianProfileId: readNullableText(payload.technicianProfileId) }
						: {}),
					...('sourceReductionMethodId' in payload
						? { sourceReductionMethodId: readText(payload.sourceReductionMethodId) ?? '' }
						: {}),
					...('sourcesEliminatedAmount' in payload
						? { sourcesEliminatedAmount: readNumber(payload.sourcesEliminatedAmount) ?? Number.NaN }
						: {}),
					...('sourcesEliminatedUnitId' in payload
						? { sourcesEliminatedUnitId: readText(payload.sourcesEliminatedUnitId) ?? '' }
						: {}),
					...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		if (hasLocationContextChange(payload)) {
			const result = createCommand(() =>
				updateSourceReductionLocationAndContextCommand({
					...ctx,
					sourceReductionId: id,
					...locationContextInput(payload),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		return commands.length === 0 ? invalidUpdate('source reduction') : { ok: true, commands };
	},
	buildDelete: (ctx, id) =>
		deleteSourceReductionCommand({
			...ctx,
			sourceReductionId: id,
			acknowledgedSupportRecordDeletion: true,
		}),
	write: (db, commands) => writeActionCommands(db, commands, writeSourceReductionCommand),
};

async function writeSourceReductionCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeSourceReduction | null> {
	switch (command.type) {
		case 'controlOperations.recordSourceReduction': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('source_reductions')
				.values({
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
				})
				.returning(sourceReductionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeSourceReduction(row);
		}
		case 'controlOperations.updateSourceReductionFieldDetails': {
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
				toSafeSourceReduction,
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
				toSafeSourceReduction,
			);
		case 'controlOperations.deleteSourceReduction':
			return softDelete(
				trx,
				'source_reductions',
				command.payload.sourceReductionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				sourceReductionReturnColumns,
				toSafeSourceReduction,
			);
		default:
			throw new Error(`Unsupported source reduction command: ${command.type}`);
	}
}

// --- Outreach actions ---

const outreachActionConfig: ActionConfig<SafeOutreachAction> = {
	noun: 'outreach action',
	basePath: '/control-operations/outreach-actions',
	notFoundError: 'outreach_action_not_found',
	idParam: 'outreachActionId',
	responseKey: 'outreachAction',
	buildCreate: (ctx, p) =>
		recordOutreachActionCommand({
			...ctx,
			outreachActionId: readText(p.id) ?? '',
			outreachMethodId: readText(p.outreachMethodId) ?? '',
			technicianProfileId: readNullableText(p.technicianProfileId),
			outreachDate: readText(p.outreachDate) ?? '',
			reach: readNumber(p.reach) ?? Number.NaN,
			reachDescription: readNullableText(p.reachDescription),
			locationSource: p.locationSource as ControlActionLocationSourceInput,
			addressId: readNullableText(p.addressId),
			context: readControlActionContext(p),
			requestedControlActionId: readNullableText(p.requestedControlActionId),
			metadata: p.metadata ?? null,
		}),
	buildUpdate: (ctx, id, payload) => {
		const commands: ControlOperationsCommand[] = [];
		const fieldKeys = [
			'outreachDate',
			'technicianProfileId',
			'outreachMethodId',
			'reach',
			'reachDescription',
			'metadata',
		];
		if (fieldKeys.some((key) => key in payload)) {
			const result = createCommand(() =>
				updateOutreachActionFieldDetailsCommand({
					...ctx,
					outreachActionId: id,
					...('outreachDate' in payload
						? { outreachDate: readText(payload.outreachDate) ?? '' }
						: {}),
					...('technicianProfileId' in payload
						? { technicianProfileId: readNullableText(payload.technicianProfileId) }
						: {}),
					...('outreachMethodId' in payload
						? { outreachMethodId: readText(payload.outreachMethodId) ?? '' }
						: {}),
					...('reach' in payload ? { reach: readNumber(payload.reach) ?? Number.NaN } : {}),
					...('reachDescription' in payload
						? { reachDescription: readNullableText(payload.reachDescription) }
						: {}),
					...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		if (hasLocationContextChange(payload)) {
			const result = createCommand(() =>
				updateOutreachActionLocationAndContextCommand({
					...ctx,
					outreachActionId: id,
					...locationContextInput(payload),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		return commands.length === 0 ? invalidUpdate('outreach action') : { ok: true, commands };
	},
	buildDelete: (ctx, id) =>
		deleteOutreachActionCommand({
			...ctx,
			outreachActionId: id,
			acknowledgedSupportRecordDeletion: true,
		}),
	write: (db, commands) => writeActionCommands(db, commands, writeOutreachActionCommand),
};

async function writeOutreachActionCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeOutreachAction | null> {
	switch (command.type) {
		case 'controlOperations.recordOutreachAction': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('outreach_actions')
				.values({
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
				})
				.returning(outreachActionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeOutreachAction(row);
		}
		case 'controlOperations.updateOutreachActionFieldDetails': {
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
				toSafeOutreachAction,
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
				toSafeOutreachAction,
			);
		case 'controlOperations.deleteOutreachAction':
			return softDelete(
				trx,
				'outreach_actions',
				command.payload.outreachActionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				outreachActionReturnColumns,
				toSafeOutreachAction,
			);
		default:
			throw new Error(`Unsupported outreach action command: ${command.type}`);
	}
}

// --- Biocontrol actions ---

const biocontrolActionConfig: ActionConfig<SafeBiocontrolAction> = {
	noun: 'biocontrol action',
	basePath: '/control-operations/biocontrol-actions',
	notFoundError: 'biocontrol_action_not_found',
	idParam: 'biocontrolActionId',
	responseKey: 'biocontrolAction',
	buildCreate: (ctx, p) =>
		recordBiocontrolActionCommand({
			...ctx,
			biocontrolActionId: readText(p.id) ?? '',
			biocontrolMethodId: readText(p.biocontrolMethodId) ?? '',
			technicianProfileId: readNullableText(p.technicianProfileId),
			biocontrolDate: readText(p.biocontrolDate) ?? '',
			amountReleased: readNumber(p.amountReleased) ?? Number.NaN,
			releaseUnitId: readText(p.releaseUnitId) ?? '',
			locationSource: p.locationSource as ControlActionLocationSourceInput,
			addressId: readNullableText(p.addressId),
			context: readControlActionContext(p),
			requestedControlActionId: readNullableText(p.requestedControlActionId),
			metadata: p.metadata ?? null,
		}),
	buildUpdate: (ctx, id, payload) => {
		const commands: ControlOperationsCommand[] = [];
		const fieldKeys = [
			'biocontrolDate',
			'technicianProfileId',
			'biocontrolMethodId',
			'amountReleased',
			'releaseUnitId',
			'metadata',
		];
		if (fieldKeys.some((key) => key in payload)) {
			const result = createCommand(() =>
				updateBiocontrolActionFieldDetailsCommand({
					...ctx,
					biocontrolActionId: id,
					...('biocontrolDate' in payload
						? { biocontrolDate: readText(payload.biocontrolDate) ?? '' }
						: {}),
					...('technicianProfileId' in payload
						? { technicianProfileId: readNullableText(payload.technicianProfileId) }
						: {}),
					...('biocontrolMethodId' in payload
						? { biocontrolMethodId: readText(payload.biocontrolMethodId) ?? '' }
						: {}),
					...('amountReleased' in payload
						? { amountReleased: readNumber(payload.amountReleased) ?? Number.NaN }
						: {}),
					...('releaseUnitId' in payload
						? { releaseUnitId: readText(payload.releaseUnitId) ?? '' }
						: {}),
					...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		if (hasLocationContextChange(payload)) {
			const result = createCommand(() =>
				updateBiocontrolActionLocationAndContextCommand({
					...ctx,
					biocontrolActionId: id,
					...locationContextInput(payload),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		return commands.length === 0 ? invalidUpdate('biocontrol action') : { ok: true, commands };
	},
	buildDelete: (ctx, id) =>
		deleteBiocontrolActionCommand({
			...ctx,
			biocontrolActionId: id,
			acknowledgedSupportRecordDeletion: true,
		}),
	write: (db, commands) => writeActionCommands(db, commands, writeBiocontrolActionCommand),
};

async function writeBiocontrolActionCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeBiocontrolAction | null> {
	switch (command.type) {
		case 'controlOperations.recordBiocontrolAction': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('biocontrol_actions')
				.values({
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
				})
				.returning(biocontrolActionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeBiocontrolAction(row);
		}
		case 'controlOperations.updateBiocontrolActionFieldDetails': {
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
				toSafeBiocontrolAction,
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
				toSafeBiocontrolAction,
			);
		case 'controlOperations.deleteBiocontrolAction':
			return softDelete(
				trx,
				'biocontrol_actions',
				command.payload.biocontrolActionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				biocontrolActionReturnColumns,
				toSafeBiocontrolAction,
			);
		default:
			throw new Error(`Unsupported biocontrol action command: ${command.type}`);
	}
}

async function writeActionCommands<TSafe>(
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	write: (
		trx: ControlOperationsTransaction,
		command: ControlOperationsCommand,
	) => Promise<TSafe | null>,
): Promise<MutationWriteResult<TSafe | null>> {
	return db.transaction().execute(async (trx) => {
		let row: TSafe | null = null;
		for (const command of commands) {
			row = await write(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

// ===========================================================================
// Requested control actions
// ===========================================================================

function registerRequestedControlActionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/control-operations/requested-control-actions',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const p = raw.payload;
			const result = createCommand(() =>
				requestControlActionCommand({
					...ctx,
					requestedControlActionId: readText(p.id) ?? '',
					controlType: (readText(p.controlType) ?? '') as never,
					locationSource: p.locationSource as RequestedControlActionLocationSourceInput,
					addressId: readNullableText(p.addressId),
					context: readControlActionContext(p),
					recommendedMethodId: readNullableText(p.recommendedMethodId),
					summary: readNullableText(p.summary),
					requestedByProfileId: readNullableText(p.requestedByProfileId),
					requestedAt: readDate(p.requestedAt),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRequestedControlActionCommands(context, options.db, [result.command], 201);
		},
	);

	app.patch(
		'/control-operations/requested-control-actions/:requestedControlActionId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = buildRequestedControlActionUpdateCommands(
				context.get('authContext'),
				context.req.param('requestedControlActionId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runRequestedControlActionCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/control-operations/requested-control-actions/:requestedControlActionId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteRequestedControlActionCommand({
					...ctx,
					requestedControlActionId: context.req.param('requestedControlActionId'),
					acknowledgedActionDetach: true,
					acknowledgedMissionDetach: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRequestedControlActionCommands(context, options.db, [result.command]);
		},
	);
}

function buildRequestedControlActionUpdateCommands(
	authContext: AuthContext,
	requestedControlActionId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: ControlOperationsCommand[] = [];

	const fieldKeys = [
		'controlType',
		'recommendedMethodId',
		'summary',
		'requestedByProfileId',
		'requestedAt',
	];
	if (fieldKeys.some((key) => key in payload)) {
		const result = createCommand(() =>
			updateRequestedControlActionDetailsCommand({
				...ctx,
				requestedControlActionId,
				...('controlType' in payload
					? { controlType: (readText(payload.controlType) ?? '') as never }
					: {}),
				...('recommendedMethodId' in payload
					? { recommendedMethodId: readNullableText(payload.recommendedMethodId) }
					: {}),
				...('summary' in payload ? { summary: readNullableText(payload.summary) } : {}),
				...('requestedByProfileId' in payload
					? { requestedByProfileId: readNullableText(payload.requestedByProfileId) }
					: {}),
				...('requestedAt' in payload ? { requestedAt: readDate(payload.requestedAt) } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	const hasLocation = 'locationSource' in payload;
	const hasAddress = 'addressId' in payload;
	const hasContext = 'context' in payload;
	if (hasLocation || hasAddress || hasContext) {
		const result = createCommand(() =>
			updateRequestedControlActionLocationAndContextCommand({
				...ctx,
				requestedControlActionId,
				...(hasLocation
					? { locationSource: payload.locationSource as RequestedControlActionLocationSourceInput }
					: {}),
				...(hasAddress ? { addressId: readNullableText(payload.addressId) } : {}),
				...(hasContext ? { context: readControlActionContext(payload) } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if ('resolvedAt' in payload || typeof payload.isResolved === 'boolean') {
		const resolved = payload.isResolved !== false && payload.resolvedAt !== null;
		const result = createCommand(() =>
			resolved
				? resolveRequestedControlActionCommand({
						...ctx,
						requestedControlActionId,
						resolvedAt: readDate(payload.resolvedAt),
					})
				: reopenRequestedControlActionCommand({ ...ctx, requestedControlActionId }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('requested control action');
	}
	return { ok: true, commands };
}

async function runRequestedControlActionCommands(
	context: CommandContext,
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeActionCommands(db, commands, writeRequestedControlActionCommand);
		if (result.row === null) {
			return context.json({ error: 'requested_control_action_not_found' }, 404);
		}
		return context.json(
			{ requestedControlAction: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeRequestedControlActionCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeRequestedControlAction | null> {
	switch (command.type) {
		case 'controlOperations.requestControlAction': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('requested_control_actions')
				.values({
					id: command.payload.requestedControlActionId,
					organization_id: command.payload.organizationId,
					control_type: command.payload.controlType,
					recommended_method_id: command.payload.recommendedMethodId,
					summary: command.payload.summary,
					habitat_id: ids.habitatId,
					inspection_id: ids.inspectionId,
					collection_id: ids.collectionId,
					geom: await resolveGeom(
						trx,
						command.payload.organizationId,
						command.payload.locationSource,
					),
					address_id: command.payload.addressId,
					requested_by_profile_id: command.payload.requestedByProfileId,
					...(command.payload.requestedAt === null
						? {}
						: { requested_at: command.payload.requestedAt }),
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(requestedControlActionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeRequestedControlAction(row);
		}
		case 'controlOperations.updateRequestedControlActionDetails': {
			const changes = command.payload.changes;
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					...('controlType' in changes ? { control_type: changes.controlType } : {}),
					...('recommendedMethodId' in changes
						? { recommended_method_id: changes.recommendedMethodId ?? null }
						: {}),
					...('summary' in changes ? { summary: changes.summary ?? null } : {}),
					...('requestedByProfileId' in changes
						? { requested_by_profile_id: changes.requestedByProfileId ?? null }
						: {}),
					...('requestedAt' in changes && changes.requestedAt !== undefined
						? { requested_at: changes.requestedAt === null ? sql`now()` : changes.requestedAt }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				requestedControlActionReturnColumns,
				toSafeRequestedControlAction,
			);
		}
		case 'controlOperations.updateRequestedControlActionLocationAndContext':
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					...(await locationContextColumns(
						trx,
						command.payload.organizationId,
						command.payload.changes,
						{ collection: true },
					)),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				requestedControlActionReturnColumns,
				toSafeRequestedControlAction,
			);
		case 'controlOperations.resolveRequestedControlAction':
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					resolved_at:
						command.payload.resolvedAt === null ? sql`now()` : command.payload.resolvedAt,
					resolved_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				requestedControlActionReturnColumns,
				toSafeRequestedControlAction,
			);
		case 'controlOperations.reopenRequestedControlAction':
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					resolved_at: null,
					resolved_by_profile_id: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				requestedControlActionReturnColumns,
				toSafeRequestedControlAction,
			);
		case 'controlOperations.deleteRequestedControlAction':
			return softDelete(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				requestedControlActionReturnColumns,
				toSafeRequestedControlAction,
			);
		default:
			throw new Error(`Unsupported requested control action command: ${command.type}`);
	}
}

// ===========================================================================
// Location source / context resolution
// ===========================================================================

type GeomTable =
	| 'addresses'
	| 'habitats'
	| 'inspections'
	| 'traps'
	| 'collections'
	| 'service_requests'
	| 'requested_control_actions'
	| 'mission_items';

async function resolveGeom(
	trx: ControlOperationsTransaction,
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
		case 'trap':
			return geojsonToGeom(
				await loadGeojson(trx, 'traps', source.trapId as string, organizationId),
			);
		case 'collection':
			return geojsonToGeom(
				await loadGeojson(trx, 'collections', source.collectionId as string, organizationId),
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
		case 'requestedControlAction':
			return geojsonToGeom(
				await loadGeojson(
					trx,
					'requested_control_actions',
					source.requestedControlActionId as string,
					organizationId,
				),
			);
		case 'missionItem':
			return geojsonToGeom(
				await loadGeojson(trx, 'mission_items', source.missionItemId as string, organizationId),
			);
		default:
			throw new CommandError(400, { error: 'unsupported_location_source' });
	}
}

async function loadGeojson(
	trx: ControlOperationsTransaction,
	table: GeomTable,
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

function contextIds(context: ControlActionContext): {
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
	readonly collectionId: string | null;
} {
	if (context.kind === 'larval') {
		return {
			habitatId: context.habitatId ?? null,
			inspectionId: context.inspectionId ?? null,
			collectionId: null,
		};
	}
	if (context.kind === 'adult') {
		return { habitatId: null, inspectionId: null, collectionId: context.collectionId };
	}
	return { habitatId: null, inspectionId: null, collectionId: null };
}

/**
 * Build the column patch for a location-and-context change. `geom`, `address_id`,
 * and `requested_control_action_id` apply where present; a `context` change
 * rewrites the habitat/inspection/collection ids (only the columns the table has,
 * selected by `available`).
 */
async function locationContextColumns(
	trx: ControlOperationsTransaction,
	organizationId: string,
	changes: {
		readonly locationSource?: { readonly kind: string } & Record<string, unknown>;
		readonly addressId?: string | null;
		readonly context?: ControlActionContext;
		readonly requestedControlActionId?: string | null;
	},
	available: { readonly collection?: boolean; readonly habitat?: boolean },
): Promise<Record<string, unknown>> {
	const columns: Record<string, unknown> = {};
	if (changes.locationSource !== undefined) {
		columns.geom = await resolveGeom(trx, organizationId, changes.locationSource);
	}
	if ('addressId' in changes) {
		columns.address_id = changes.addressId ?? null;
	}
	if ('requestedControlActionId' in changes) {
		columns.requested_control_action_id = changes.requestedControlActionId ?? null;
	}
	if (changes.context !== undefined) {
		const ids = contextIds(changes.context);
		if (available.habitat !== false) {
			columns.habitat_id = ids.habitatId;
		}
		columns.inspection_id = ids.inspectionId;
		if (available.collection === true) {
			columns.collection_id = ids.collectionId;
		}
	}
	return columns;
}

function readControlActionContext(payload: Record<string, unknown>): ControlActionContext {
	if (isRecord(payload.context)) {
		return payload.context as ControlActionContext;
	}
	const collectionId = readNullableText(payload.collectionId);
	if (collectionId !== null) {
		return { kind: 'adult', collectionId };
	}
	const habitatId = readNullableText(payload.habitatId);
	const inspectionId = readNullableText(payload.inspectionId);
	if (habitatId !== null || inspectionId !== null) {
		return {
			kind: 'larval',
			...(habitatId !== null ? { habitatId } : {}),
			...(inspectionId !== null ? { inspectionId } : {}),
		};
	}
	return { kind: 'none' };
}

function hasLocationContextChange(payload: Record<string, unknown>): boolean {
	return (
		'locationSource' in payload ||
		'addressId' in payload ||
		'context' in payload ||
		'habitatId' in payload ||
		'inspectionId' in payload ||
		'collectionId' in payload ||
		'requestedControlActionId' in payload
	);
}

function locationContextInput(payload: Record<string, unknown>): {
	readonly locationSource?: ControlActionLocationSourceInput;
	readonly addressId?: string | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: string | null;
} {
	return {
		...('locationSource' in payload
			? { locationSource: payload.locationSource as ControlActionLocationSourceInput }
			: {}),
		...('addressId' in payload ? { addressId: readNullableText(payload.addressId) } : {}),
		...('context' in payload ||
		'habitatId' in payload ||
		'inspectionId' in payload ||
		'collectionId' in payload
			? { context: readControlActionContext(payload) }
			: {}),
		...('requestedControlActionId' in payload
			? { requestedControlActionId: readNullableText(payload.requestedControlActionId) }
			: {}),
	};
}

// ===========================================================================
// Generic row write helpers
// ===========================================================================

async function updateActionRow<TRow, TSafe>(
	trx: ControlOperationsTransaction,
	table:
		| 'applications'
		| 'source_reductions'
		| 'outreach_actions'
		| 'biocontrol_actions'
		| 'requested_control_actions',
	id: string,
	organizationId: string,
	set: Record<string, unknown>,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({ ...set, updated_at: sql`now()` } as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

async function softDelete<TRow, TSafe>(
	trx: ControlOperationsTransaction,
	table:
		| 'formulations'
		| 'formulation_insecticides'
		| 'applications'
		| 'application_batches'
		| 'source_reductions'
		| 'outreach_actions'
		| 'biocontrol_actions'
		| 'requested_control_actions',
	id: string,
	organizationId: string,
	actorProfileId: string,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			updated_at: sql`now()`,
		} as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

// ===========================================================================
// Response shaping
// ===========================================================================

const formulationReturnColumns = [
	'id',
	'organization_id',
	'formulation_name',
	'description',
	'is_active',
	'diluent_ratio',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeFormulation {
	readonly id: string;
	readonly organizationId: string;
	readonly formulationName: string;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly diluentRatio: number;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeFormulation(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly formulation_name: string;
	readonly description: string | null;
	readonly is_active: boolean;
	readonly diluent_ratio: number;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeFormulation {
	return {
		id: row.id,
		organizationId: row.organization_id,
		formulationName: row.formulation_name,
		description: row.description,
		isActive: row.is_active,
		diluentRatio: row.diluent_ratio,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const formulationInsecticideReturnColumns = [
	'id',
	'organization_id',
	'formulation_id',
	'insecticide_id',
	'ratio',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeFormulationInsecticide {
	readonly id: string;
	readonly organizationId: string;
	readonly formulationId: string;
	readonly insecticideId: string;
	readonly ratio: number;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeFormulationInsecticide(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly formulation_id: string;
	readonly insecticide_id: string;
	readonly ratio: number;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeFormulationInsecticide {
	return {
		id: row.id,
		organizationId: row.organization_id,
		formulationId: row.formulation_id,
		insecticideId: row.insecticide_id,
		ratio: row.ratio,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const applicationReturnColumns = [
	'id',
	'organization_id',
	'application_method_id',
	'insecticide_id',
	'applicator_profile_id',
	'application_date',
	'address_id',
	'vehicle_id',
	'equipment_id',
	'amount_applied',
	'application_unit_id',
	'habitat_id',
	'collection_id',
	'inspection_id',
	'requested_control_action_id',
	'mission_item_id',
	'metadata',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeApplication {
	readonly id: string;
	readonly organizationId: string;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeApplication(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly metadata: unknown | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeApplication {
	return {
		id: row.id,
		organizationId: row.organization_id,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const applicationBatchReturnColumns = [
	'id',
	'organization_id',
	'application_id',
	'insecticide_batch_id',
	'created_at',
	'updated_at',
] as const;

interface SafeApplicationBatch {
	readonly id: string;
	readonly organizationId: string;
	readonly applicationId: string;
	readonly insecticideBatchId: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeApplicationBatch(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly application_id: string;
	readonly insecticide_batch_id: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeApplicationBatch {
	return {
		id: row.id,
		organizationId: row.organization_id,
		applicationId: row.application_id,
		insecticideBatchId: row.insecticide_batch_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const sourceReductionReturnColumns = [
	'id',
	'organization_id',
	'metadata',
	'created_at',
	'updated_at',
] as const;

interface SafeSourceReduction {
	readonly id: string;
	readonly organizationId: string;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeSourceReduction(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly metadata: unknown | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeSourceReduction {
	return {
		id: row.id,
		organizationId: row.organization_id,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const outreachActionReturnColumns = [
	'id',
	'organization_id',
	'metadata',
	'created_at',
	'updated_at',
] as const;

interface SafeOutreachAction {
	readonly id: string;
	readonly organizationId: string;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeOutreachAction(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly metadata: unknown | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeOutreachAction {
	return {
		id: row.id,
		organizationId: row.organization_id,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const biocontrolActionReturnColumns = [
	'id',
	'organization_id',
	'metadata',
	'created_at',
	'updated_at',
] as const;

interface SafeBiocontrolAction {
	readonly id: string;
	readonly organizationId: string;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeBiocontrolAction(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly metadata: unknown | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeBiocontrolAction {
	return {
		id: row.id,
		organizationId: row.organization_id,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const requestedControlActionReturnColumns = [
	'id',
	'organization_id',
	'control_type',
	'recommended_method_id',
	'summary',
	'habitat_id',
	'inspection_id',
	'collection_id',
	'address_id',
	'requested_by_profile_id',
	'requested_at',
	'resolved_at',
	'resolved_by_profile_id',
	'created_at',
	'updated_at',
] as const;

interface SafeRequestedControlAction {
	readonly id: string;
	readonly organizationId: string;
	readonly controlType: string;
	readonly resolvedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeRequestedControlAction(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly control_type: string;
	readonly resolved_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRequestedControlAction {
	return {
		id: row.id,
		organizationId: row.organization_id,
		controlType: row.control_type,
		resolvedAt: row.resolved_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

interface RouteOptions {
	readonly db: ControlOperationsDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

type AgencyContext = { readonly organizationId: string; readonly actorProfileId: string };

type CommandsResult =
	| { readonly ok: true; readonly commands: readonly ControlOperationsCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody };

type FormulationUpdateColumns = {
	formulation_name?: string;
	description?: string | null;
	diluent_ratio?: number;
	is_active?: boolean;
	updated_by_profile_id: string;
};

type ApplicationUpdateColumns = {
	geom?: ReturnType<typeof geojsonToGeom>;
	application_method_id?: string | null;
	insecticide_id?: string;
	applicator_profile_id?: string | null;
	application_date?: ReturnType<typeof localDateColumn>;
	address_id?: string | null;
	vehicle_id?: string | null;
	equipment_id?: string | null;
	amount_applied?: number;
	application_unit_id?: string;
	habitat_id?: string | null;
	collection_id?: string | null;
	inspection_id?: string | null;
	requested_control_action_id?: string | null;
	metadata?: unknown | null;
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

function createCommand<TCommand extends ControlOperationsCommand>(
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

function agencyCommandContext(authContext: AuthContext): AgencyContext {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
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

async function readCurrentTransactionId(trx: ControlOperationsTransaction): Promise<number> {
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

function readDate(value: unknown): Date | null {
	if (typeof value !== 'string' && !(value instanceof Date)) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
