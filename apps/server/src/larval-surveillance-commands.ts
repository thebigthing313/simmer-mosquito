import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	type CreateHabitatCommand,
	createHabitatCommand,
	DomainValidationError,
	type HabitatLocationSourceInput,
	type SupportedGeoJsonGeometry,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';

type LarvalSurveillanceDb = Kysely<SimmerDatabase>;
type LarvalSurveillanceTransaction = Transaction<SimmerDatabase>;
type LarvalSurveillanceCommand = CreateHabitatCommand;

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

export function registerLarvalSurveillanceCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: LarvalSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post('/larval-surveillance/habitats', options.authContextMiddleware, async (context) => {
		const payloadResult = await readHabitatPayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const commandResult = createCommand(() =>
			createHabitatCommand({
				...agencyCommandContext(context.get('authContext')),
				habitatId: payloadResult.payload.id,
				locationSource: payloadResult.payload.locationSource,
				addressId: payloadResult.payload.addressId,
				habitatTypeId: payloadResult.payload.habitatTypeId,
				habitatName: payloadResult.payload.habitatName,
				description: payloadResult.payload.description,
				metadata: payloadResult.payload.metadata,
			}),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		if (commandResult.command.payload.locationSource.kind !== 'geometry') {
			return context.json(
				{
					error: 'invalid_payload',
					reason: 'Only manual geometry habitat creation is supported from this endpoint.',
				},
				400,
			);
		}

		const result = await writeLarvalSurveillanceCommands(options.db, [commandResult.command]);
		return context.json({ habitat: toHabitatResponse(result.row), txid: result.txid }, 201);
	});
}

async function writeLarvalSurveillanceCommands(
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
): Promise<MutationWriteResult<SafeHabitat>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeHabitat | null = null;
		for (const command of commands) {
			row = await writeLarvalSurveillanceCommand(trx, command);
		}

		if (row === null) {
			throw new Error('No larval surveillance command was written.');
		}

		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeLarvalSurveillanceCommand(
	db: LarvalSurveillanceTransaction,
	command: LarvalSurveillanceCommand,
): Promise<SafeHabitat> {
	switch (command.type) {
		case 'larvalSurveillance.createHabitat': {
			const locationSource = command.payload.locationSource;
			if (locationSource.kind !== 'geometry') {
				throw new Error('Only manual geometry habitat creation is supported.');
			}

			return createHabitat(db, {
				id: command.payload.habitatId,
				organizationId: command.payload.organizationId,
				geojson: locationSource.geometry,
				addressId: command.payload.addressId,
				habitatTypeId: command.payload.habitatTypeId,
				habitatName: command.payload.habitatName,
				description: command.payload.description,
				metadata: command.payload.metadata,
				actorProfileId: command.payload.actorProfileId,
			});
		}
	}
}

interface HabitatWriteInput {
	readonly id: string;
	readonly organizationId: string;
	readonly geojson: SupportedGeoJsonGeometry;
	readonly addressId: string | null;
	readonly habitatTypeId: string | null;
	readonly habitatName: string | null;
	readonly description: string;
	readonly metadata: unknown | null;
	readonly actorProfileId: string;
}

async function createHabitat(
	db: LarvalSurveillanceTransaction,
	input: HabitatWriteInput,
): Promise<SafeHabitat> {
	const row = await db
		.insertInto('habitats')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			geom: geojsonToGeom(input.geojson),
			address_id: input.addressId,
			habitat_type_id: input.habitatTypeId,
			habitat_name: input.habitatName,
			description: input.description,
			is_active: true,
			is_inaccessible: false,
			metadata: input.metadata,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(habitatReturnColumns)
		.executeTakeFirstOrThrow();

	return toSafeHabitat(row);
}

function geojsonToGeom(geojson: SupportedGeoJsonGeometry) {
	const serialized = JSON.stringify(geojson);
	return sql<string>`st_force2d(st_setsrid(st_geomfromgeojson(
		case
			when (${serialized}::jsonb -> 'geometry') is not null
				then (${serialized}::jsonb -> 'geometry')::text
			else ${serialized}
		end
	), 4326))`;
}

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
				body: {
					error: 'invalid_command',
					message: error.message,
					issues: error.issues,
				},
			};
		}

		throw error;
	}
}

type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

interface HabitatPayload {
	readonly id: string;
	readonly locationSource: HabitatLocationSourceInput;
	readonly addressId: string | null;
	readonly habitatTypeId: string | null;
	readonly habitatName: string | null;
	readonly description: string;
	readonly metadata: unknown | null;
}

type PayloadResult<T> =
	| { readonly ok: true; readonly payload: T }
	| { readonly ok: false; readonly reason: string };

async function readHabitatPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<HabitatPayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}

	const raw = rawResult.payload;
	const locationResult = readHabitatLocationSource(raw.locationSource);
	if (!locationResult.ok) {
		return locationResult;
	}

	return {
		ok: true,
		payload: {
			id: readRequiredText(raw.id) ?? '',
			locationSource: locationResult.payload,
			addressId: readOptionalText(raw.addressId),
			habitatTypeId: readOptionalText(raw.habitatTypeId),
			habitatName: readOptionalText(raw.habitatName),
			description: readRequiredText(raw.description) ?? '',
			metadata: raw.metadata === undefined ? null : readOptionalJson(raw.metadata),
		},
	};
}

function readHabitatLocationSource(
	value: unknown,
): PayloadResult<Extract<HabitatLocationSourceInput, { readonly kind: 'geometry' }>> {
	if (!isRecord(value) || value.kind !== 'geometry') {
		return invalid('locationSource must be manual geometry.');
	}

	return {
		ok: true,
		payload: {
			kind: 'geometry',
			geometry: value.geometry,
		},
	};
}

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<Record<string, unknown>>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return invalid('Request body must be JSON.');
	}

	if (!isRecord(raw)) {
		return invalid('Request body must be an object.');
	}

	return { ok: true, payload: raw };
}

function readRequiredText(value: unknown): string | null {
	const text = readOptionalText(value);
	return text === null ? null : text;
}

function readOptionalText(value: unknown): string | null {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readOptionalJson(value: unknown): unknown | null {
	return value === undefined ? null : value;
}

function invalid(reason: string): PayloadResult<never> {
	return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

async function readCurrentTransactionId(db: LarvalSurveillanceTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(db);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}

	return Number.parseInt(txid, 10);
}

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

function toHabitatResponse(row: SafeHabitat) {
	return {
		id: row.id,
		organizationId: row.organizationId,
		addressId: row.addressId,
		habitatTypeId: row.habitatTypeId,
		habitatName: row.habitatName,
		description: row.description,
		isActive: row.isActive,
		isInaccessible: row.isInaccessible,
		metadata: row.metadata,
		createdByProfileId: row.createdByProfileId,
		updatedByProfileId: row.updatedByProfileId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
