import {
	type AddressRow,
	applyRecordDeletion,
	createAddress,
	deleteAddress,
	type GeoJsonGeometry,
	type MutationWriteResult,
	type OrgLookupRow,
	readCurrentTransactionId,
	type TagRow,
	updateAddressDetails,
	updateAddressLocation,
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
import {
	agencyCommandContext,
	createCommand,
	type InvalidCommandBody,
	invalidUpdate,
	type PayloadResult,
} from '../command-endpoint.js';
import { isRecord } from '../command-payload.js';
import type { CommandDb, CommandTransaction } from '../command-write.js';

export type FoundationCommandDb = CommandDb;
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

/**
 * One command's worth of work inside the shared write transaction.
 *
 * These were batch writers taking `(db, commands)` and opening their own
 * transaction, which is also why they never asserted ownership — `writeCommands`
 * owns the loop now, and it requires an actor. What stays injectable is the
 * single-command write, which is all a test driving these handlers needs to
 * stand in for.
 */
export type LookupCommandWriter = (
	trx: CommandTransaction,
	command: LookupCommand,
) => Promise<OrgLookupRow | null>;
export type TagCommandWriter = (
	trx: CommandTransaction,
	command: TagCommand,
) => Promise<TagRow | null>;

export async function writeAddressWithTxid(
	db: FoundationCommandDb,
	input: AddressWriteInput,
): Promise<MutationWriteResult<AddressRow>> {
	return db.transaction().execute(async (trx) => {
		const row = await createAddress(trx, input);
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

export async function writeAddressUpdateWithTxid(
	db: FoundationCommandDb,
	addressId: string,
	input: AddressUpdateWriteInput,
): Promise<MutationWriteResult<AddressRow | null>> {
	const { organizationId, updatedByProfileId, geojson, ...details } = input;
	return db.transaction().execute(async (trx) => {
		let row: AddressRow | null = null;
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
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

export async function writeAddressDeleteWithTxid(
	db: FoundationCommandDb,
	addressId: string,
	input: { readonly organizationId: string; readonly actorProfileId: string },
): Promise<MutationWriteResult<AddressRow | null>> {
	return db.transaction().execute(async (trx) => {
		await applyRecordDeletion(trx, {
			recordType: 'address',
			recordId: addressId,
			organizationId: input.organizationId,
			actorProfileId: input.actorProfileId,
			// See the address command handler: every rule that reaches another
			// record blocks, so there is no consequence to confirm.
			acknowledged: {},
		});
		const row = await deleteAddress(trx, addressId, input);
		return { row, txid: await readCurrentTransactionId(trx) };
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
		return invalidUpdate('collection lure');
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
		return invalidUpdate('habitat type');
	}

	return { ok: true, commands };
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

export function readAddressCreatePayload(
	raw: Record<string, unknown>,
): PayloadResult<AddressCreatePayload> {
	const id = readRequiredText(raw.id);
	const displayName = readRequiredText(raw.displayName);
	const country = readRequiredText(raw.country)?.toUpperCase() ?? null;
	const geojson = readGeoJson(raw.geojson);

	if (id === null || displayName === null) {
		return invalidPayload('id and displayName are required.');
	}
	if (country === null || country.length !== 2) {
		return invalidPayload('country must be a two-letter country code.');
	}
	if (geojson === null) {
		return invalidPayload('geojson must be a GeoJSON geometry object.');
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

export function readAddressUpdatePayload(
	raw: Record<string, unknown>,
): PayloadResult<AddressUpdatePayload> {
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
			return invalidPayload('displayName must be a non-empty string.');
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
			return invalidPayload('geojson must be a GeoJSON geometry object.');
		}
		payload.geojson = geojson;
	}

	if (Object.keys(payload).length === 0) {
		return invalidPayload('At least one address field must change.');
	}

	return { ok: true, payload };
}

export function readCollectionMethodCreatePayload(
	raw: Record<string, unknown>,
): PayloadResult<CollectionMethodCreatePayload> {
	const id = readRequiredText(raw.id);
	const name = readRequiredText(raw.name);
	const actionThreshold = readOptionalNonnegativeInteger(raw.actionThreshold);
	if (id === null || name === null) {
		return invalidPayload('id and name are required.');
	}
	if (actionThreshold === undefined) {
		return invalidPayload('actionThreshold must be a nonnegative integer.');
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

export function readCollectionMethodUpdatePayload(
	raw: Record<string, unknown>,
): PayloadResult<CollectionMethodUpdatePayload> {
	const actionThreshold = readOptionalNonnegativeInteger(raw.actionThreshold);
	if (actionThreshold === undefined) {
		return invalidPayload('actionThreshold must be a nonnegative integer.');
	}
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalidPayload('isActive must be a boolean.');
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

function invalidPayload(reason: string): PayloadResult<never> {
	return { ok: false, reason };
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

function readOptionalJson(value: unknown): unknown | null {
	return value === undefined ? null : value;
}

function readOptionalNonnegativeInteger(value: unknown): number | null | undefined {
	if (value === undefined || value === null || value === '') {
		return null;
	}

	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		return undefined;
	}

	return value;
}

function readGeoJson(value: unknown): GeoJsonGeometry | null {
	if (!isRecord(value) || typeof value.type !== 'string') {
		return null;
	}

	return value;
}
