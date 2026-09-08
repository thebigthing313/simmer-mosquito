import {
	createIssues,
	nullableText as normalizeNullableText,
	requiredUuid as requireUuid,
	validateOperatorCommandContext,
} from '../command-validation.js';
import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type GeoJsonMultiPolygon,
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

export interface OrganizationFoundationCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface OrganizationFoundationCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface OperatorFoundationCommandInput {
	readonly operatorUserId: DomainId;
}

export interface OperatorFoundationCommandPayload {
	readonly operatorUserId: DomainId;
}

export function validateOperatorBase(
	input: OperatorFoundationCommandInput,
	issues: DomainValidationIssue[],
): void {
	validateOperatorCommandContext(input, issues);
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

/**
 * What a Region may store: one area, or several on the same row.
 *
 * Two names rather than `SupportedGeoJsonGeometry`, so a reader of
 * `CreateRegionCommand.geometry` is told which four shapes cannot be there.
 */
export type RegionGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

/** A Region's geometry, against the Region policy in the register. */
export function validateRegionGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): RegionGeometry {
	try {
		return normalizeOwnedGeometry('region', value, path);
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

export function operatorPayload(
	input: OperatorFoundationCommandInput,
): OperatorFoundationCommandPayload {
	return validateOperatorCommandContext(input, createIssues());
}
