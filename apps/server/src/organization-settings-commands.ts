import { type Kysely, type SimmerDatabase, sql, type Transaction } from '@simmer-mosquito/db';
import {
	mergeOrganizationSettingsChange,
	type OrganizationSettingsCommand,
	type OrganizationSettingsCommandType,
	updateAdultCollectionTimingModeCommand,
	updateInsecticideBatchTrackingCommand,
	updateLarvalInspectionEntryPolicyCommand,
	updateServiceRequestContextCommand,
	updateSpeciesKeyBindingsCommand,
	updateTimezoneCommand,
	updateUnitDefaultsCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import { type AgencyContext, commandEndpoint, type PayloadResult } from './command-endpoint.js';
import { denyUnauthorizedCommandType } from './command-permissions.js';

type OrganizationSettingsDb = Kysely<SimmerDatabase>;
type OrganizationSettingsTransaction = Transaction<SimmerDatabase>;

export function registerOrganizationSettingsCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: OrganizationSettingsDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	/**
	 * The floor for this route's command, read from `COMMAND_PERMISSIONS` and
	 * still applied before the body is read — so an unauthorized caller learns
	 * nothing about which fields a valid payload would have had.
	 *
	 * The floor used to be written out here as `hasAtLeastRole(role, 'admin')`.
	 * It is the map's to state now (#130); this only asks.
	 */
	const requireSettingsFloor =
		(type: OrganizationSettingsCommandType): MiddlewareHandler<{ Variables: AuthVariables }> =>
		async (context, next) => {
			const refusal = denyUnauthorizedCommandType(context, type);
			if (refusal !== null) {
				return refusal;
			}
			await next();
		};

	const settingsEndpoint = (
		build: (request: {
			readonly payload: Record<string, unknown>;
			readonly agency: AgencyContext;
		}) => OrganizationSettingsCommand,
	) =>
		commandEndpoint<OrganizationSettingsCommand>({
			build,
			run: (context, commands) =>
				writeSettingsCommandResponse(
					options.db,
					context.get('authContext'),
					commands[0] as OrganizationSettingsCommand,
				),
		});

	/**
	 * `type` is not a label. Binding the build function's return to
	 * `Extract<…, { type: TType }>` makes the declared type and the built command
	 * the same thing to the compiler, so a route cannot be gated on one command's
	 * floor while sending another's.
	 */
	const settingsRoute = <TType extends OrganizationSettingsCommandType>(
		path: string,
		type: TType,
		build: (request: {
			readonly payload: Record<string, unknown>;
			readonly agency: AgencyContext;
		}) => Extract<OrganizationSettingsCommand, { readonly type: NoInfer<TType> }>,
		readPayload?: (raw: Record<string, unknown>) => PayloadResult<Record<string, unknown>>,
	) =>
		app.patch(
			`/organization-settings/${path}`,
			options.authContextMiddleware,
			requireSettingsFloor(type),
			readPayload === undefined
				? settingsEndpoint(build)
				: commandEndpoint<OrganizationSettingsCommand, Record<string, unknown>>({
						readPayload,
						build,
						run: (context, commands) =>
							writeSettingsCommandResponse(
								options.db,
								context.get('authContext'),
								commands[0] as OrganizationSettingsCommand,
							),
					}),
		);

	settingsRoute('timezone', 'organizationSettings.updateTimezone', ({ payload, agency }) =>
		updateTimezoneCommand({
			...agency,
			timezone: readRequiredText(payload.timezone) ?? '',
			expectedUpdatedAt: readOptionalDate(payload.expectedUpdatedAt),
		}),
	);

	settingsRoute('unit-defaults', 'organizationSettings.updateUnitDefaults', ({ payload, agency }) =>
		updateUnitDefaultsCommand({
			...agency,
			unitDefaults: payload.unitDefaults as never,
			expectedUpdatedAt: readOptionalDate(payload.expectedUpdatedAt),
		}),
	);

	settingsRoute(
		'adult-collection-timing-mode',
		'organizationSettings.updateAdultCollectionTimingMode',
		({ payload, agency }) =>
			updateAdultCollectionTimingModeCommand({
				...agency,
				collectionTimingMode: readRequiredText(payload.collectionTimingMode) as never,
				expectedUpdatedAt: readOptionalDate(payload.expectedUpdatedAt),
			}),
	);

	settingsRoute(
		'larval-inspection-entry-policy',
		'organizationSettings.updateLarvalInspectionEntryPolicy',
		({ payload, agency }) =>
			updateLarvalInspectionEntryPolicyCommand({
				...agency,
				policy: payload.policy as never,
				expectedUpdatedAt: readOptionalDate(payload.expectedUpdatedAt),
			}),
	);

	settingsRoute(
		'insecticide-batch-tracking',
		'organizationSettings.updateInsecticideBatchTracking',
		({ payload, agency }) =>
			updateInsecticideBatchTrackingCommand({
				...agency,
				trackInsecticideBatches: payload.trackInsecticideBatches as boolean,
				expectedUpdatedAt: readOptionalDate(payload.expectedUpdatedAt),
			}),
		// The only setting whose type the domain builder cannot infer from a
		// missing value: `false` and absent are both falsy.
		(raw) =>
			typeof raw.trackInsecticideBatches === 'boolean'
				? { ok: true, payload: raw }
				: { ok: false, reason: 'trackInsecticideBatches must be a boolean.' },
	);

	settingsRoute(
		'service-request-context',
		'organizationSettings.updateServiceRequestContext',
		({ payload, agency }) =>
			updateServiceRequestContextCommand({
				...agency,
				serviceRequestContext: payload.serviceRequestContext as never,
				expectedUpdatedAt: readOptionalDate(payload.expectedUpdatedAt),
			}),
	);

	settingsRoute(
		'species-key-bindings',
		'organizationSettings.updateSpeciesKeyBindings',
		({ payload, agency }) =>
			updateSpeciesKeyBindingsCommand({
				...agency,
				speciesKeyBindings: payload.speciesKeyBindings as never,
				expectedUpdatedAt: readOptionalDate(payload.expectedUpdatedAt),
			}),
	);
}

async function writeSettingsCommandResponse(
	db: OrganizationSettingsDb,
	authContext: AuthContext,
	command: OrganizationSettingsCommand,
): Promise<Response> {
	const validationError = await validateDbReferences(db, command);
	if (validationError !== null) {
		return Response.json(validationError, { status: 400 });
	}

	const writeResult = await db.transaction().execute(async (trx) => {
		const organization = await trx
			.selectFrom('organizations')
			.select(['id', 'settings', 'updated_at'])
			.where('id', '=', authContext.organization.id)
			.where('deleted_at', 'is', null)
			.executeTakeFirst();

		if (organization === undefined) {
			return { kind: 'not_found' as const };
		}

		if (
			command.payload.expectedUpdatedAt !== null &&
			organization.updated_at.getTime() !== command.payload.expectedUpdatedAt.getTime()
		) {
			return { kind: 'conflict' as const, updatedAt: organization.updated_at.toISOString() };
		}

		const settings = mergeOrganizationSettingsChange(
			organization.settings,
			settingsChangeForCommand(command),
		);

		const row = await trx
			.updateTable('organizations')
			.set({
				settings,
				updated_at: sql`now()`,
				updated_by_profile_id: authContext.profile.id,
			})
			.where('id', '=', authContext.organization.id)
			.where('deleted_at', 'is', null)
			.returning(['id', 'settings', 'updated_at', 'updated_by_profile_id'])
			.executeTakeFirstOrThrow();

		const txidRow = await sql<{
			readonly txid: string;
		}>`select pg_current_xact_id()::xid::text as txid`
			.execute(trx)
			.then((result) => result.rows[0]);

		return {
			kind: 'ok' as const,
			settings: row.settings,
			updatedAt: row.updated_at.toISOString(),
			updatedByProfileId: row.updated_by_profile_id,
			txid: Number(txidRow?.txid ?? 0),
		};
	});

	if (writeResult.kind === 'not_found') {
		return Response.json({ error: 'organization_not_found' }, { status: 404 });
	}
	if (writeResult.kind === 'conflict') {
		return Response.json(
			{ error: 'settings_conflict', updatedAt: writeResult.updatedAt },
			{ status: 409 },
		);
	}

	return Response.json(writeResult);
}

async function validateDbReferences(
	db: OrganizationSettingsDb,
	command: OrganizationSettingsCommand,
): Promise<Record<string, unknown> | null> {
	if (command.type === 'organizationSettings.updateUnitDefaults') {
		for (const [unitType, code] of Object.entries(command.payload.unitDefaults)) {
			const exists = await unitCodeExists(db, code, unitType);
			if (!exists) {
				return {
					error: 'invalid_unit_default',
					reason: `${code} is not a ${unitType} unit.`,
				};
			}
		}
	}

	// Referenced-row existence is a server-side check: the builder can only confirm the
	// binding shape, not that the taxonomy still carries the species it names.
	if (command.type === 'organizationSettings.updateSpeciesKeyBindings') {
		for (const binding of command.payload.speciesKeyBindings.bindings) {
			const exists = await speciesExists(db, binding.speciesId);
			if (!exists) {
				return {
					error: 'invalid_species_key_binding',
					reason: `Key "${binding.key}" is bound to a species that no longer exists.`,
				};
			}
		}
	}

	if (command.type === 'organizationSettings.updateServiceRequestContext') {
		const code = command.payload.serviceRequestContext.radius.unitCode;
		const exists = await unitCodeExists(db, code, 'distance');
		if (!exists) {
			return {
				error: 'invalid_service_request_radius_unit',
				reason: `${code} is not a distance unit.`,
			};
		}
	}

	return null;
}

async function speciesExists(db: OrganizationSettingsDb, speciesId: string): Promise<boolean> {
	const row = await db
		.selectFrom('species')
		.select('id')
		.where('id', '=', speciesId)
		.executeTakeFirst();

	return row !== undefined;
}

async function unitCodeExists(
	db: OrganizationSettingsDb | OrganizationSettingsTransaction,
	code: string,
	unitType: string,
): Promise<boolean> {
	const row = await db
		.selectFrom('units')
		.select('id')
		.where('code', '=', code)
		.where('unit_type', '=', unitType as never)
		.executeTakeFirst();

	return row !== undefined;
}

function settingsChangeForCommand(command: OrganizationSettingsCommand) {
	switch (command.type) {
		case 'organizationSettings.updateTimezone':
			return { kind: 'timezone' as const, timezone: command.payload.timezone };
		case 'organizationSettings.updateUnitDefaults':
			return { kind: 'unitDefaults' as const, unitDefaults: command.payload.unitDefaults };
		case 'organizationSettings.updateAdultCollectionTimingMode':
			return {
				kind: 'adultCollectionTimingMode' as const,
				collectionTimingMode: command.payload.collectionTimingMode,
			};
		case 'organizationSettings.updateLarvalInspectionEntryPolicy':
			return { kind: 'larvalInspectionEntryPolicy' as const, policy: command.payload.policy };
		case 'organizationSettings.updateInsecticideBatchTracking':
			return {
				kind: 'insecticideBatchTracking' as const,
				trackInsecticideBatches: command.payload.trackInsecticideBatches,
			};
		case 'organizationSettings.updateServiceRequestContext':
			return {
				kind: 'serviceRequestContext' as const,
				serviceRequestContext: command.payload.serviceRequestContext,
			};
		case 'organizationSettings.updateSpeciesKeyBindings':
			return {
				kind: 'speciesKeyBindings' as const,
				speciesKeyBindings: command.payload.speciesKeyBindings,
			};
	}
}

function readRequiredText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readOptionalDate(value: unknown): Date | null {
	if (value === undefined || value === null || value === '') {
		return null;
	}
	if (typeof value !== 'string') {
		return new Date(Number.NaN);
	}
	return new Date(value);
}
