import {
	createIssues,
	jsonObject as normalizeJsonObject,
	nullableText as normalizeNullableText,
	normalizeRequiredDomainId,
	requiredText as normalizeRequiredText,
	organizationPayload,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateIdList,
	validateOrganizationBase,
	validateOrganizationIdCommand,
	validatePointGeometry,
} from '../command-validation.js';
import type { DomainId, GeoJsonPoint, JsonObject } from '../shared.js';
import {
	jsonObjectField,
	nullableTextField,
	requiredTextField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import {
	type FoundationDomainCommand,
	normalizeCountry,
	normalizePostalCode,
	normalizeUsRegion,
	type OrganizationFoundationCommandInput,
	type OrganizationFoundationCommandPayload,
} from './shared.js';

export interface CreateAddressCommandInput extends OrganizationFoundationCommandInput {
	readonly addressId: DomainId;
	readonly displayName: string;
	readonly geometry: unknown;
	readonly country?: string | null;
	readonly addressLine1?: string | null;
	readonly addressLine2?: string | null;
	readonly locality?: string | null;
	readonly region?: string | null;
	readonly postalCode?: string | null;
	readonly geocoderResponse?: unknown | null;
}

export type CreateAddressCommand = FoundationDomainCommand<
	'foundation.createAddress',
	OrganizationFoundationCommandPayload & {
		readonly addressId: DomainId;
		readonly displayName: string;
		readonly geometry: GeoJsonPoint;
		readonly country: 'US';
		readonly addressLine1: string | null;
		readonly addressLine2: string | null;
		readonly locality: string | null;
		readonly region: string | null;
		readonly postalCode: string | null;
		readonly geocoderResponse: JsonObject | null;
	}
>;

export const ADDRESS_UPDATE_FIELDS = {
	displayName: requiredTextField(200),
	addressLine1: nullableTextField(200),
	addressLine2: nullableTextField(200),
	locality: nullableTextField(200),
	region: normalizeUsRegion,
	postalCode: normalizePostalCode,
	geocoderResponse: jsonObjectField,
} satisfies UpdateFieldSet;

export type UpdateAddressDetailsCommandInput = OrganizationFoundationCommandInput &
	UpdateFieldsInput<typeof ADDRESS_UPDATE_FIELDS> & {
		readonly addressId: DomainId;
	};

export type UpdateAddressDetailsCommand = FoundationDomainCommand<
	'foundation.updateAddressDetails',
	OrganizationFoundationCommandPayload & {
		readonly addressId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof ADDRESS_UPDATE_FIELDS>;
	}
>;

export interface UpdateAddressLocationCommandInput extends OrganizationFoundationCommandInput {
	readonly addressId: DomainId;
	readonly geometry: unknown;
}

export type UpdateAddressLocationCommand = FoundationDomainCommand<
	'foundation.updateAddressLocation',
	OrganizationFoundationCommandPayload & {
		readonly addressId: DomainId;
		readonly geometry: GeoJsonPoint;
	}
>;

export interface AddressIdCommandInput extends OrganizationFoundationCommandInput {
	readonly addressId: DomainId;
}

export type DeleteAddressCommand = FoundationDomainCommand<
	'foundation.deleteAddress',
	OrganizationFoundationCommandPayload & { readonly addressId: DomainId }
>;

export interface MergeAddressesCommandInput extends OrganizationFoundationCommandInput {
	readonly targetAddressId: DomainId;
	readonly sourceAddressIds: readonly DomainId[];
	readonly acknowledgedMergeConsolidatesHistory?: boolean;
}

export type MergeAddressesCommand = FoundationDomainCommand<
	'foundation.mergeAddresses',
	OrganizationFoundationCommandPayload & {
		readonly targetAddressId: DomainId;
		readonly sourceAddressIds: readonly DomainId[];
		readonly acknowledgedMergeConsolidatesHistory: true;
	}
>;

export function createAddressCommand(input: CreateAddressCommandInput): CreateAddressCommand {
	const issues = createIssues();
	validateOrganizationBase(input, issues);
	requireUuid(input.addressId, 'addressId', issues);
	const displayName = normalizeRequiredText(input.displayName, 'displayName', issues, 200);
	const geometry = validatePointGeometry('address', input.geometry, 'geometry', issues);
	const country = normalizeCountry(input.country, issues);
	const region = normalizeUsRegion(input.region, 'region', issues);
	const postalCode = normalizePostalCode(input.postalCode, 'postalCode', issues);
	const geocoderResponse = normalizeJsonObject(input.geocoderResponse, 'geocoderResponse', issues);
	throwIfIssues('Create address command is invalid.', issues);

	return {
		type: 'foundation.createAddress',
		payload: {
			...organizationPayload(input),
			addressId: normalizeRequiredDomainId(input.addressId),
			displayName,
			geometry,
			country,
			addressLine1: normalizeNullableText(input.addressLine1, 'addressLine1', issues, 200),
			addressLine2: normalizeNullableText(input.addressLine2, 'addressLine2', issues, 200),
			locality: normalizeNullableText(input.locality, 'locality', issues, 200),
			region,
			postalCode,
			geocoderResponse,
		},
	};
}

export function updateAddressDetailsCommand(
	input: UpdateAddressDetailsCommandInput,
): UpdateAddressDetailsCommand {
	return updateFieldsCommand({
		type: 'foundation.updateAddressDetails',
		input,
		idKey: 'addressId',
		fields: ADDRESS_UPDATE_FIELDS,
		changeNoun: 'address',
		emptyChangeMessage: 'At least one address detail must change.',
		message: 'Update address details command is invalid.',
	});
}

export function updateAddressLocationCommand(
	input: UpdateAddressLocationCommandInput,
): UpdateAddressLocationCommand {
	const issues = validateOrganizationIdCommand(input, 'addressId');
	const geometry = validatePointGeometry('address', input.geometry, 'geometry', issues);
	throwIfIssues('Update address location command is invalid.', issues);
	return {
		type: 'foundation.updateAddressLocation',
		payload: {
			...organizationPayload(input),
			addressId: normalizeRequiredDomainId(input.addressId),
			geometry,
		},
	};
}

export function deleteAddressCommand(input: AddressIdCommandInput): DeleteAddressCommand {
	const issues = validateOrganizationIdCommand(input, 'addressId');
	throwIfIssues('Delete address command is invalid.', issues);
	return {
		type: 'foundation.deleteAddress',
		payload: {
			...organizationPayload(input),
			addressId: normalizeRequiredDomainId(input.addressId),
		},
	};
}

export function mergeAddressesCommand(input: MergeAddressesCommandInput): MergeAddressesCommand {
	const issues = createIssues();
	validateOrganizationBase(input, issues);
	requireUuid(input.targetAddressId, 'targetAddressId', issues);
	const sourceAddressIds = validateIdList(input.sourceAddressIds, 'sourceAddressIds', issues);
	const targetAddressId = normalizeRequiredDomainId(input.targetAddressId);
	if (sourceAddressIds.includes(targetAddressId)) {
		issues.push({
			path: 'sourceAddressIds',
			message: 'sourceAddressIds cannot include targetAddressId.',
		});
	}
	if (input.acknowledgedMergeConsolidatesHistory !== true) {
		issues.push({
			path: 'acknowledgedMergeConsolidatesHistory',
			message: 'Address merge requires acknowledgement.',
		});
	}
	throwIfIssues('Merge addresses command is invalid.', issues);
	return {
		type: 'foundation.mergeAddresses',
		payload: {
			...organizationPayload(input),
			targetAddressId,
			sourceAddressIds,
			acknowledgedMergeConsolidatesHistory: true,
		},
	};
}
