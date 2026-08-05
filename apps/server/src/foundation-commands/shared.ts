import {
	applyRecordDeletion,
	createAddress,
	deleteAddress,
	type GeoJsonGeometry,
	type MutationWriteResult,
	type SafeAddress,
	type SafeOrgLookup,
	type SafeTag,
	sql,
	updateAddressDetails,
	updateAddressLocation,
	type writeCollectionMethodLookupCommandsWithTxid,
} from '@simmer-mosquito/db';
import {
	type ActivateTagCommand,
	type CreateCollectionLureCommand,
	type CreateCollectionMethodCommand,
	type CreateHabitatTypeCommand,
	type CreateTagCommand,
	type DeactivateCollectionLureCommand,
	type DeactivateCollectionMethodCommand,
	type DeactivateHabitatTypeCommand,
	type DeactivateTagCommand,
	type DeleteCollectionLureCommand,
	type DeleteCollectionMethodCommand,
	type DeleteHabitatTypeCommand,
	type DeleteTagCommand,
	DomainValidationError,
	deactivateCollectionLureCommand,
	deactivateCollectionMethodCommand,
	deactivateHabitatTypeCommand,
	type ReactivateCollectionLureCommand,
	type ReactivateCollectionMethodCommand,
	type ReactivateHabitatTypeCommand,
	reactivateCollectionLureCommand,
	reactivateCollectionMethodCommand,
	reactivateHabitatTypeCommand,
	type UpdateCollectionLureCommand,
	type UpdateCollectionMethodCommand,
	type UpdateHabitatTypeCommand,
	type UpdateTagCommand,
	updateCollectionLureCommand,
	updateCollectionMethodCommand,
	updateHabitatTypeCommand,
} from '@simmer-mosquito/domain';
import type { AuthContext } from '../auth-context.js';

export type FoundationCommandDb = Parameters<typeof writeCollectionMethodLookupCommandsWithTxid>[0];
export type CollectionMethodCommand =
	| CreateCollectionMethodCommand
	| UpdateCollectionMethodCommand
	| DeactivateCollectionMethodCommand
	| ReactivateCollectionMethodCommand
	| DeleteCollectionMethodCommand;
export type CollectionLureCommand =
	| CreateCollectionLureCommand
	| UpdateCollectionLureCommand
	| DeactivateCollectionLureCommand
	| ReactivateCollectionLureCommand
	| DeleteCollectionLureCommand;
export type HabitatTypeCommand =
	| CreateHabitatTypeCommand
	| UpdateHabitatTypeCommand
	| DeactivateHabitatTypeCommand
	| ReactivateHabitatTypeCommand
	| DeleteHabitatTypeCommand;
export type TagCommand =
	| CreateTagCommand
	| UpdateTagCommand
	| DeactivateTagCommand
	| ActivateTagCommand
	| DeleteTagCommand;
export type LookupCommand = CollectionMethodCommand | CollectionLureCommand | HabitatTypeCommand;
export type FoundationCommand = LookupCommand | TagCommand;

export type CollectionMethodCommandWriter = (
	db: FoundationCommandDb,
	commands: readonly LookupCommand[],
) => Promise<MutationWriteResult<SafeOrgLookup | null>>;
export type TagCommandWriter = (
	db: FoundationCommandDb,
	commands: readonly TagCommand[],
) => Promise<MutationWriteResult<SafeTag | null>>;

export async function writeAddressWithTxid(
	db: FoundationCommandDb,
	input: AddressWriteInput,
): Promise<MutationWriteResult<SafeAddress>> {
	return db.transaction().execute(async (trx) => {
		const row = await createAddress(trx, input);
		const result = await sql<{
			txid: string;
		}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
		const txid = result.rows[0]?.txid;
		if (txid === undefined) {
			throw new Error('Unable to read current transaction id.');
		}

		return { row, txid: Number.parseInt(txid, 10) };
	});
}

export async function writeAddressUpdateWithTxid(
	db: FoundationCommandDb,
	addressId: string,
	input: AddressUpdateWriteInput,
): Promise<MutationWriteResult<SafeAddress | null>> {
	const { organizationId, updatedByProfileId, geojson, ...details } = input;
	return db.transaction().execute(async (trx) => {
		let row: SafeAddress | null = null;
		if (Object.keys(details).length > 0) {
			row = await updateAddressDetails(trx, addressId, {
				organizationId,
				updatedByProfileId,
				...details,
			});
		}
		if (geojson !== undefined) {
			row = await updateAddressLocation(trx, addressId, {
				organizationId,
				geojson,
				updatedByProfileId,
			});
		}
		const result = await sql<{
			txid: string;
		}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
		const txid = result.rows[0]?.txid;
		if (txid === undefined) {
			throw new Error('Unable to read current transaction id.');
		}
		return { row, txid: Number.parseInt(txid, 10) };
	});
}

export async function writeAddressDeleteWithTxid(
	db: FoundationCommandDb,
	addressId: string,
	input: { readonly organizationId: string; readonly actorProfileId: string },
): Promise<MutationWriteResult<SafeAddress | null>> {
	return db.transaction().execute(async (trx) => {
		await applyRecordDeletion(trx, {
			recordType: 'address',
			recordId: addressId,
			organizationId: input.organizationId,
			actorProfileId: input.actorProfileId,
		});
		const row = await deleteAddress(trx, addressId, input);
		const result = await sql<{
			txid: string;
		}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
		const txid = result.rows[0]?.txid;
		if (txid === undefined) {
			throw new Error('Unable to read current transaction id.');
		}
		return { row, txid: Number.parseInt(txid, 10) };
	});
}

export function buildUpdateCommands(
	authContext: AuthContext,
	collectionMethodId: string,
	payload: CollectionMethodUpdatePayload,
):
	| { readonly ok: true; readonly commands: readonly CollectionMethodCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const commands: CollectionMethodCommand[] = [];
	const hasDetailChange =
		payload.name !== undefined ||
		payload.description !== undefined ||
		payload.customSchema !== undefined ||
		payload.actionThreshold !== undefined;

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			updateCollectionMethodCommand({
				...agencyCommandContext(authContext),
				collectionMethodId,
				...(payload.name === undefined ? {} : { name: payload.name }),
				...(payload.description === undefined ? {} : { description: payload.description }),
				...(payload.customSchema === undefined ? {} : { customSchema: payload.customSchema }),
				...(payload.actionThreshold === undefined
					? {}
					: { actionThreshold: payload.actionThreshold }),
				acknowledgedHistoricalLabelChange: true,
			}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (payload.isActive !== undefined) {
		const commandResult = createCommand(() =>
			payload.isActive
				? reactivateCollectionMethodCommand({
						...agencyCommandContext(authContext),
						collectionMethodId,
					})
				: deactivateCollectionMethodCommand({
						...agencyCommandContext(authContext),
						collectionMethodId,
					}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (commands.length === 0) {
		return {
			ok: false,
			body: {
				error: 'invalid_command',
				message: 'At least one collection method field must change.',
				issues: [{ path: 'changes', message: 'At least one collection method field must change.' }],
			},
		};
	}

	return { ok: true, commands };
}

export function buildCollectionLureUpdateCommands(
	authContext: AuthContext,
	collectionLureId: string,
	payload: CollectionMethodUpdatePayload,
):
	| { readonly ok: true; readonly commands: readonly CollectionLureCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const commands: CollectionLureCommand[] = [];
	const hasDetailChange = payload.name !== undefined || payload.description !== undefined;

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			updateCollectionLureCommand({
				...agencyCommandContext(authContext),
				collectionLureId,
				...(payload.name === undefined ? {} : { name: payload.name }),
				...(payload.description === undefined ? {} : { description: payload.description }),
				acknowledgedHistoricalLabelChange: true,
			}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (payload.isActive !== undefined) {
		const commandResult = createCommand(() =>
			payload.isActive
				? reactivateCollectionLureCommand({
						...agencyCommandContext(authContext),
						collectionLureId,
					})
				: deactivateCollectionLureCommand({
						...agencyCommandContext(authContext),
						collectionLureId,
					}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (commands.length === 0) {
		return invalidUpdateCommand('collection lure');
	}

	return { ok: true, commands };
}

export function buildHabitatTypeUpdateCommands(
	authContext: AuthContext,
	habitatTypeId: string,
	payload: CollectionMethodUpdatePayload,
):
	| { readonly ok: true; readonly commands: readonly HabitatTypeCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const commands: HabitatTypeCommand[] = [];
	const hasDetailChange =
		payload.name !== undefined ||
		payload.description !== undefined ||
		payload.customSchema !== undefined;

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			updateHabitatTypeCommand({
				...agencyCommandContext(authContext),
				habitatTypeId,
				...(payload.name === undefined ? {} : { name: payload.name }),
				...(payload.description === undefined ? {} : { description: payload.description }),
				...(payload.customSchema === undefined ? {} : { customSchema: payload.customSchema }),
				acknowledgedHistoricalLabelChange: true,
			}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (payload.isActive !== undefined) {
		const commandResult = createCommand(() =>
			payload.isActive
				? reactivateHabitatTypeCommand({
						...agencyCommandContext(authContext),
						habitatTypeId,
					})
				: deactivateHabitatTypeCommand({
						...agencyCommandContext(authContext),
						habitatTypeId,
					}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (commands.length === 0) {
		return invalidUpdateCommand('habitat type');
	}

	return { ok: true, commands };
}

export function invalidUpdateCommand(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: {
			error: 'invalid_command',
			message,
			issues: [{ path: 'changes', message }],
		},
	};
}

export type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

export function createCommand<TCommand extends FoundationCommand>(
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

export interface CollectionMethodCreatePayload {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly customSchema: unknown | null;
	readonly actionThreshold: number | null;
}

export interface AddressCreatePayload {
	readonly id: string;
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	readonly geocoderResponse: unknown | null;
	readonly geojson: GeoJsonGeometry;
}

export interface AddressWriteInput extends AddressCreatePayload {
	readonly organizationId: string;
	readonly createdByProfileId: string;
	readonly updatedByProfileId: string;
}

export interface AddressUpdatePayload {
	readonly displayName?: string;
	readonly addressLine1?: string | null;
	readonly addressLine2?: string | null;
	readonly locality?: string | null;
	readonly region?: string | null;
	readonly postalCode?: string | null;
	readonly geocoderResponse?: unknown | null;
	readonly geojson?: GeoJsonGeometry;
}

export interface AddressUpdateWriteInput extends AddressUpdatePayload {
	readonly organizationId: string;
	readonly updatedByProfileId: string;
}

export interface CollectionMethodUpdatePayload {
	readonly name?: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly actionThreshold?: number | null;
	readonly isActive?: boolean;
}

export type PayloadResult<T> =
	| { readonly ok: true; readonly payload: T }
	| { readonly ok: false; readonly reason: string };

export async function readAddressCreatePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<AddressCreatePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	const id = readRequiredText(raw.id);
	const displayName = readRequiredText(raw.displayName);
	const country = readRequiredText(raw.country)?.toUpperCase() ?? null;
	const geojson = readGeoJson(raw.geojson);

	if (id === null || displayName === null) {
		return invalid('id and displayName are required.');
	}
	if (country === null || country.length !== 2) {
		return invalid('country must be a two-letter country code.');
	}
	if (geojson === null) {
		return invalid('geojson must be a GeoJSON geometry object.');
	}

	return {
		ok: true,
		payload: {
			id,
			displayName,
			country,
			addressLine1: readOptionalText(raw.addressLine1),
			addressLine2: readOptionalText(raw.addressLine2),
			locality: readOptionalText(raw.locality),
			region: readOptionalText(raw.region),
			postalCode: readOptionalText(raw.postalCode),
			geocoderResponse: readOptionalJson(raw.geocoderResponse),
			geojson,
		},
	};
}

export async function readAddressUpdatePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<AddressUpdatePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	const payload: {
		displayName?: string;
		addressLine1?: string | null;
		addressLine2?: string | null;
		locality?: string | null;
		region?: string | null;
		postalCode?: string | null;
		geocoderResponse?: unknown | null;
		geojson?: GeoJsonGeometry;
	} = {};

	if (raw.displayName !== undefined) {
		const displayName = readRequiredText(raw.displayName);
		if (displayName === null) {
			return invalid('displayName must be a non-empty string.');
		}
		payload.displayName = displayName;
	}
	if (raw.addressLine1 !== undefined) {
		payload.addressLine1 = readOptionalText(raw.addressLine1);
	}
	if (raw.addressLine2 !== undefined) {
		payload.addressLine2 = readOptionalText(raw.addressLine2);
	}
	if (raw.locality !== undefined) {
		payload.locality = readOptionalText(raw.locality);
	}
	if (raw.region !== undefined) {
		payload.region = readOptionalText(raw.region);
	}
	if (raw.postalCode !== undefined) {
		payload.postalCode = readOptionalText(raw.postalCode);
	}
	if (raw.geocoderResponse !== undefined) {
		payload.geocoderResponse = readOptionalJson(raw.geocoderResponse);
	}
	if (raw.geojson !== undefined) {
		const geojson = readGeoJson(raw.geojson);
		if (geojson === null) {
			return invalid('geojson must be a GeoJSON geometry object.');
		}
		payload.geojson = geojson;
	}

	if (Object.keys(payload).length === 0) {
		return invalid('At least one address field must change.');
	}

	return { ok: true, payload };
}

export async function readCollectionMethodCreatePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<CollectionMethodCreatePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	const id = readRequiredText(raw.id);
	const name = readRequiredText(raw.name);
	const actionThreshold = readOptionalNonnegativeInteger(raw.actionThreshold);
	if (id === null || name === null) {
		return invalid('id and name are required.');
	}
	if (actionThreshold === undefined) {
		return invalid('actionThreshold must be a nonnegative integer.');
	}

	return {
		ok: true,
		payload: {
			id,
			name,
			description: readOptionalText(raw.description),
			customSchema: readOptionalJson(raw.customSchema),
			actionThreshold,
		},
	};
}

export async function readCollectionMethodUpdatePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<CollectionMethodUpdatePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	const actionThreshold = readOptionalNonnegativeInteger(raw.actionThreshold);
	if (actionThreshold === undefined) {
		return invalid('actionThreshold must be a nonnegative integer.');
	}
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalid('isActive must be a boolean.');
	}

	return {
		ok: true,
		payload: {
			...(raw.name === undefined ? {} : { name: readRequiredText(raw.name) ?? '' }),
			...(raw.description === undefined ? {} : { description: readOptionalText(raw.description) }),
			...(raw.customSchema === undefined
				? {}
				: { customSchema: readOptionalJson(raw.customSchema) }),
			...(raw.actionThreshold === undefined ? {} : { actionThreshold }),
			...(raw.isActive === undefined ? {} : { isActive: raw.isActive }),
		},
	};
}

export async function readJsonObject(request: {
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

export function readRequiredText(value: unknown): string | null {
	return readOptionalText(value);
}

export function readOptionalText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

export function readOptionalJson(value: unknown): unknown | null {
	return value === undefined ? null : value;
}

export function readOptionalNonnegativeInteger(value: unknown): number | null | undefined {
	if (value === undefined || value === null || value === '') {
		return null;
	}

	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		return undefined;
	}

	return value;
}

export function readGeoJson(value: unknown): GeoJsonGeometry | null {
	if (!isRecord(value) || typeof value.type !== 'string') {
		return null;
	}

	return value;
}

export function invalid(reason: string): PayloadResult<never> {
	return { ok: false, reason };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

export function toAddressResponse(row: SafeAddress) {
	return {
		id: row.id,
		organizationId: row.organizationId,
		geometry: row.geometry,
		displayName: row.displayName,
		country: row.country,
		addressLine1: row.addressLine1,
		addressLine2: row.addressLine2,
		locality: row.locality,
		region: row.region,
		postalCode: row.postalCode,
		createdByProfileId: row.createdByProfileId,
		updatedByProfileId: row.updatedByProfileId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function toCollectionMethodResponse(row: SafeOrgLookup | null) {
	if (row === null) {
		return null;
	}

	return {
		id: row.id,
		organizationId: row.organizationId,
		name: row.name,
		description: row.description,
		customSchema: row.customSchema,
		actionThreshold: row.actionThreshold,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
