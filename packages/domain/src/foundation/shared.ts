import {
	createIssues,
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	validateAgencyCommandContext,
	validateOperatorCommandContext,
} from '../command-validation.js';
import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type GeoJsonPoint,
	type GeoJsonPolygon,
	normalizeOwnedGeometry,
} from '../shared.js';

export type FoundationCommandType =
	| 'foundation.createAddress'
	| 'foundation.updateAddressDetails'
	| 'foundation.updateAddressLocation'
	| 'foundation.deleteAddress'
	| 'foundation.mergeAddresses'
	| 'foundation.createRegionFolder'
	| 'foundation.updateRegionFolder'
	| 'foundation.deleteRegionFolder'
	| 'foundation.createRegion'
	| 'foundation.updateRegionDetails'
	| 'foundation.moveRegionToFolder'
	| 'foundation.updateRegionGeometry'
	| 'foundation.deleteRegion'
	| 'foundation.createGenus'
	| 'foundation.updateGenus'
	| 'foundation.deleteGenus'
	| 'foundation.createSpecies'
	| 'foundation.updateSpecies'
	| 'foundation.deleteSpecies'
	| 'foundation.createUnit'
	| 'foundation.updateUnit'
	| 'foundation.deleteUnit'
	| 'foundation.selectOrganizationSpecies'
	| 'foundation.unselectOrganizationSpecies'
	| 'foundation.createCollectionMethod'
	| 'foundation.updateCollectionMethod'
	| 'foundation.deactivateCollectionMethod'
	| 'foundation.reactivateCollectionMethod'
	| 'foundation.deleteCollectionMethod'
	| 'foundation.createCollectionLure'
	| 'foundation.updateCollectionLure'
	| 'foundation.deactivateCollectionLure'
	| 'foundation.reactivateCollectionLure'
	| 'foundation.deleteCollectionLure'
	| 'foundation.createHabitatType'
	| 'foundation.updateHabitatType'
	| 'foundation.deactivateHabitatType'
	| 'foundation.reactivateHabitatType'
	| 'foundation.deleteHabitatType';

export type FoundationWarningCode =
	| 'duplicateAddressDisplayName'
	| 'duplicateAddressFeature'
	| 'duplicateRegionNameInFolder'
	| 'duplicateRegionFeatureInFolder'
	| 'duplicateSpeciesDisplayName'
	| 'mergedAddressLocationDiffers';

export interface FoundationCommandWarning {
	readonly code: FoundationWarningCode;
	readonly path: string;
	readonly message: string;
}

export interface FoundationDomainCommand<TType extends FoundationCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

export interface AgencyFoundationCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface AgencyFoundationCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface OperatorFoundationCommandInput {
	readonly operatorUserId: DomainId;
}

export interface OperatorFoundationCommandPayload {
	readonly operatorUserId: DomainId;
}

export function validateAgencyBase(
	input: AgencyFoundationCommandInput,
	issues: DomainValidationIssue[],
): void {
	validateAgencyCommandContext(input, issues);
}

export function validateOperatorBase(
	input: OperatorFoundationCommandInput,
	issues: DomainValidationIssue[],
): void {
	validateOperatorCommandContext(input, issues);
}

export function validateAgencyIdCommand<T extends AgencyFoundationCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

export function validateOperatorIdCommand<T extends OperatorFoundationCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateOperatorBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

/** An Address's geometry, against the Address policy in the register. */
export function validatePointGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): GeoJsonPoint {
	try {
		return normalizeOwnedGeometry('address', value, path) as GeoJsonPoint;
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return { type: 'Point', coordinates: [0, 0] };
		}
		throw error;
	}
}

/** A Region's geometry, against the Region policy in the register. */
export function validatePolygonGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): GeoJsonPolygon {
	try {
		return normalizeOwnedGeometry('region', value, path) as GeoJsonPolygon;
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return {
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[0, 1],
						[1, 1],
						[0, 0],
					],
				],
			};
		}
		throw error;
	}
}

export function validateIdList(
	values: readonly DomainId[],
	path: string,
	issues: DomainValidationIssue[],
): readonly DomainId[] {
	if (!Array.isArray(values) || values.length === 0) {
		issues.push({ path, message: `${path} must include at least one id.` });
		return [];
	}
	const seen = new Set<string>();
	return values.map((value, index) => {
		requireUuid(value, `${path}.${index}`, issues);
		const normalized = normalizeRequiredId(value);
		if (seen.has(normalized)) {
			issues.push({ path: `${path}.${index}`, message: `${path} must not contain duplicates.` });
		}
		seen.add(normalized);
		return normalized;
	});
}

export function normalizeCountry(
	value: string | null | undefined,
	issues: DomainValidationIssue[],
): 'US' {
	const normalized = value === undefined || value === null ? 'US' : value.trim().toUpperCase();
	if (normalized !== 'US') {
		issues.push({ path: 'country', message: 'country must be US for v1.' });
	}
	return 'US';
}

export function normalizeUsRegion(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 2);
	if (normalized === null) {
		return null;
	}
	const upper = normalized.toUpperCase();
	if (!/^[A-Z]{2}$/.test(upper)) {
		issues.push({ path, message: `${path} must be a two-letter state or territory code.` });
	}
	return upper;
}

export function normalizePostalCode(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 10);
	if (normalized === null) {
		return null;
	}
	if (!/^\d{5}(-\d{4})?$/.test(normalized)) {
		issues.push({ path, message: `${path} must be a ZIP or ZIP+4 postal code.` });
	}
	return normalized;
}

export function agencyPayload(input: AgencyFoundationCommandInput): AgencyFoundationCommandPayload {
	return validateAgencyCommandContext(input, createIssues());
}

export function operatorPayload(
	input: OperatorFoundationCommandInput,
): OperatorFoundationCommandPayload {
	return validateOperatorCommandContext(input, createIssues());
}

export function normalizeRequiredDomainId(value: DomainId): DomainId {
	return normalizeRequiredId(value);
}
