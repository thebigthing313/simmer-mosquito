import { type Kysely, type SimmerDatabase, sql, type Transaction } from '@simmer-mosquito/db';
import {
	DomainValidationError,
	mergeOrganizationSettingsChange,
	type OrganizationSettingsCommand,
	updateInsecticideBatchTrackingCommand,
	updateLarvalInspectionEntryPolicyCommand,
	updateServiceRequestContextCommand,
	updateTimezoneCommand,
	updateUnitDefaultsCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';

type OrganizationSettingsDb = Kysely<SimmerDatabase>;
type OrganizationSettingsTransaction = Transaction<SimmerDatabase>;

export function registerOrganizationSettingsCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: OrganizationSettingsDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.patch('/organization-settings/timezone', options.authContextMiddleware, async (context) => {
		const payloadResult = await readJsonObject(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		return writeSettingsCommandResponse(options.db, context.get('authContext'), () =>
			updateTimezoneCommand({
				...agencyCommandContext(context.get('authContext')),
				timezone: readRequiredText(payloadResult.payload.timezone) ?? '',
				expectedUpdatedAt: readOptionalDate(payloadResult.payload.expectedUpdatedAt),
			}),
		);
	});

	app.patch(
		'/organization-settings/unit-defaults',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readJsonObject(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			return writeSettingsCommandResponse(options.db, context.get('authContext'), () =>
				updateUnitDefaultsCommand({
					...agencyCommandContext(context.get('authContext')),
					unitDefaults: payloadResult.payload.unitDefaults as never,
					expectedUpdatedAt: readOptionalDate(payloadResult.payload.expectedUpdatedAt),
				}),
			);
		},
	);

	app.patch(
		'/organization-settings/larval-inspection-entry-policy',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readJsonObject(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			return writeSettingsCommandResponse(options.db, context.get('authContext'), () =>
				updateLarvalInspectionEntryPolicyCommand({
					...agencyCommandContext(context.get('authContext')),
					policy: payloadResult.payload.policy as never,
					expectedUpdatedAt: readOptionalDate(payloadResult.payload.expectedUpdatedAt),
				}),
			);
		},
	);

	app.patch(
		'/organization-settings/insecticide-batch-tracking',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readJsonObject(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}
			if (typeof payloadResult.payload.trackInsecticideBatches !== 'boolean') {
				return context.json(
					{
						error: 'invalid_payload',
						reason: 'trackInsecticideBatches must be a boolean.',
					},
					400,
				);
			}
			const trackInsecticideBatches = payloadResult.payload.trackInsecticideBatches;

			return writeSettingsCommandResponse(options.db, context.get('authContext'), () =>
				updateInsecticideBatchTrackingCommand({
					...agencyCommandContext(context.get('authContext')),
					trackInsecticideBatches,
					expectedUpdatedAt: readOptionalDate(payloadResult.payload.expectedUpdatedAt),
				}),
			);
		},
	);

	app.patch(
		'/organization-settings/service-request-context',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readJsonObject(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			return writeSettingsCommandResponse(options.db, context.get('authContext'), () =>
				updateServiceRequestContextCommand({
					...agencyCommandContext(context.get('authContext')),
					serviceRequestContext: payloadResult.payload.serviceRequestContext as never,
					expectedUpdatedAt: readOptionalDate(payloadResult.payload.expectedUpdatedAt),
				}),
			);
		},
	);
}

async function writeSettingsCommandResponse(
	db: OrganizationSettingsDb,
	authContext: AuthContext,
	buildCommand: () => OrganizationSettingsCommand,
): Promise<Response> {
	if (!canManageOrganizationSettings(authContext.role)) {
		return Response.json(
			{ error: 'forbidden', reason: 'Only organization owners and admins can manage settings.' },
			{ status: 403 },
		);
	}

	let command: OrganizationSettingsCommand;
	try {
		command = buildCommand();
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return Response.json(
				{ error: 'invalid_command', message: error.message, issues: error.issues },
				{ status: 400 },
			);
		}
		throw error;
	}

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
	}
}

type PayloadResult =
	| { readonly ok: true; readonly payload: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string };

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult> {
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

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

function canManageOrganizationSettings(role: AuthContext['role']): boolean {
	return role === 'owner' || role === 'admin';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
