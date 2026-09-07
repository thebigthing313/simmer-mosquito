import type { GeoJsonGeometry } from '@simmer-mosquito/db';
import {
	type AddressRow,
	createAddress,
	type MutationWriteResult,
	readCurrentTransactionId,
} from '@simmer-mosquito/db';
import type {
	ActivateTagCommand,
	CreateCollectionLureCommand,
	CreateCollectionMethodCommand,
	CreateHabitatTypeCommand,
	CreateTagCommand,
	DeactivateCollectionLureCommand,
	DeactivateCollectionMethodCommand,
	DeactivateHabitatTypeCommand,
	DeactivateTagCommand,
	DeleteCollectionLureCommand,
	DeleteCollectionMethodCommand,
	DeleteHabitatTypeCommand,
	DeleteTagCommand,
	ReactivateCollectionLureCommand,
	ReactivateCollectionMethodCommand,
	ReactivateHabitatTypeCommand,
	UpdateCollectionLureCommand,
	UpdateCollectionMethodCommand,
	UpdateHabitatTypeCommand,
	UpdateTagCommand,
} from '@simmer-mosquito/domain';
import type { PayloadResult } from '../../command-endpoint.js';
import { isRecord } from '../../command-payload.js';
import type { CommandDb } from '../../command-write.js';

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

function invalidPayload(reason: string): PayloadResult<never> {
	return { ok: false, reason };
}

function readRequiredText(value: unknown): string | null {
	return readOptionalText(value);
}

function readOptionalText(value: unknown): string | null {
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

/** What `createAddress` takes beyond the payload: the organization and the actor. */
interface AddressWriteInput extends AddressCreatePayload {
	readonly organizationId: string;
	readonly createdByProfileId: string;
	readonly updatedByProfileId: string;
}

/**
 * The one address write the seed route makes, with the transaction id its
 * caller answers with. The rest of the address writers went with the routes
 * that were their only callers (#634).
 */
export async function writeAddressWithTxid(
	db: CommandDb,
	input: AddressWriteInput,
): Promise<MutationWriteResult<AddressRow>> {
	return db.transaction().execute(async (trx) => {
		const row = await createAddress(trx, input);
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}
