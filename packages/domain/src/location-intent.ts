import { requiredUuid } from './command-validation.js';
import {
	type DomainId,
	type DomainValidationIssue,
	type GeoJsonPoint,
	type SupportedGeoJsonGeometry,
	type SupportedGeometryType,
	validateGeometry,
} from './shared.js';

export type ManualPointGeometrySourceInput = {
	readonly kind: 'geometry';
	readonly geometry: unknown;
};
export type ManualPointGeometrySource = {
	readonly kind: 'geometry';
	readonly geometry: GeoJsonPoint;
};
export type ManualLocatableGeometrySourceInput = {
	readonly kind: 'geometry';
	readonly geometry: unknown;
};
export type ManualLocatableGeometrySource = {
	readonly kind: 'geometry';
	readonly geometry: SupportedGeoJsonGeometry;
};

export type AddressGeometrySource = { readonly kind: 'address'; readonly addressId: DomainId };
export type HabitatGeometrySource = { readonly kind: 'habitat'; readonly habitatId: DomainId };
export type InspectionGeometrySource = {
	readonly kind: 'inspection';
	readonly inspectionId: DomainId;
};
export type TrapGeometrySource = { readonly kind: 'trap'; readonly trapId: DomainId };
export type CollectionGeometrySource = {
	readonly kind: 'collection';
	readonly collectionId: DomainId;
};
export type ServiceRequestGeometrySource = {
	readonly kind: 'serviceRequest';
	readonly serviceRequestId: DomainId;
};
export type RequestedControlActionGeometrySource = {
	readonly kind: 'requestedControlAction';
	readonly requestedControlActionId: DomainId;
};
export type MissionItemGeometrySource = {
	readonly kind: 'missionItem';
	readonly missionItemId: DomainId;
};

export type TrapLocationSourceInput = ManualPointGeometrySourceInput | AddressGeometrySource;
export type TrapLocationSource = ManualPointGeometrySource | AddressGeometrySource;

export type AdultCollectionLocationSourceInput =
	| ManualPointGeometrySourceInput
	| AddressGeometrySource
	| TrapGeometrySource;
export type AdultCollectionLocationSource =
	| ManualPointGeometrySource
	| AddressGeometrySource
	| TrapGeometrySource;

export type HabitatLocationSourceInput =
	| ManualLocatableGeometrySourceInput
	| AddressGeometrySource
	| InspectionGeometrySource;
export type HabitatLocationSource =
	| ManualLocatableGeometrySource
	| AddressGeometrySource
	| InspectionGeometrySource;

export type AdHocInspectionLocationSourceInput =
	| ManualLocatableGeometrySourceInput
	| AddressGeometrySource
	| HabitatGeometrySource
	| ServiceRequestGeometrySource;
export type AdHocInspectionLocationSource =
	| ManualLocatableGeometrySource
	| AddressGeometrySource
	| HabitatGeometrySource
	| ServiceRequestGeometrySource;

export type RequestedControlActionLocationSourceInput =
	| ManualLocatableGeometrySourceInput
	| AddressGeometrySource
	| HabitatGeometrySource
	| TrapGeometrySource
	| CollectionGeometrySource
	| InspectionGeometrySource
	| ServiceRequestGeometrySource;
export type RequestedControlActionLocationSource =
	| ManualLocatableGeometrySource
	| AddressGeometrySource
	| HabitatGeometrySource
	| TrapGeometrySource
	| CollectionGeometrySource
	| InspectionGeometrySource
	| ServiceRequestGeometrySource;

export type MissionItemLocationSourceInput =
	| RequestedControlActionLocationSourceInput
	| RequestedControlActionGeometrySource;
export type MissionItemLocationSource =
	| RequestedControlActionLocationSource
	| RequestedControlActionGeometrySource;

export type AdHocControlActionLocationSourceInput =
	| ManualLocatableGeometrySourceInput
	| AddressGeometrySource
	| ServiceRequestGeometrySource
	| HabitatGeometrySource;
export type AdHocControlActionLocationSource =
	| ManualLocatableGeometrySource
	| AddressGeometrySource
	| ServiceRequestGeometrySource
	| HabitatGeometrySource;

export type InheritedControlActionLocationSourceInput =
	| InspectionGeometrySource
	| RequestedControlActionGeometrySource
	| MissionItemGeometrySource;
export type InheritedControlActionLocationSource = InheritedControlActionLocationSourceInput;

export type ControlActionLocationSourceInput =
	| AdHocControlActionLocationSourceInput
	| InheritedControlActionLocationSourceInput;
export type ControlActionLocationSource =
	| AdHocControlActionLocationSource
	| InheritedControlActionLocationSource;

const POINT_GEOMETRY_TYPES = ['Point'] as const;
const LOCATABLE_GEOMETRY_TYPES = ['Point', 'LineString', 'Polygon'] as const;

/**
 * Which sources each workflow permits.
 *
 * Exported because this is the only place the rule is allowed to live. The server
 * resolves geometry over the whole `LocationSource` union and does not re-check the
 * kind, so a list that disagreed with one of these would be a second, looser policy
 * — which is exactly what four hand-written resolver switches had become.
 */
export const TRAP_LOCATION_SOURCE_KINDS = ['geometry', 'address'] as const;
export const ADULT_COLLECTION_LOCATION_SOURCE_KINDS = ['geometry', 'address', 'trap'] as const;
export const HABITAT_LOCATION_SOURCE_KINDS = ['geometry', 'address', 'inspection'] as const;
export const AD_HOC_INSPECTION_LOCATION_SOURCE_KINDS = [
	'geometry',
	'address',
	'habitat',
	'serviceRequest',
] as const;
export const REQUESTED_CONTROL_ACTION_LOCATION_SOURCE_KINDS = [
	'geometry',
	'address',
	'habitat',
	'trap',
	'collection',
	'inspection',
	'serviceRequest',
] as const;
export const MISSION_ITEM_LOCATION_SOURCE_KINDS = [
	...REQUESTED_CONTROL_ACTION_LOCATION_SOURCE_KINDS,
	'requestedControlAction',
] as const;
export const CONTROL_ACTION_LOCATION_SOURCE_KINDS = [
	'geometry',
	'address',
	'serviceRequest',
	'habitat',
	'inspection',
	'requestedControlAction',
	'missionItem',
] as const;

export function validateTrapLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): TrapLocationSource {
	return validateLocationSourceFlow(
		input,
		path,
		issues,
		TRAP_LOCATION_SOURCE_KINDS,
		POINT_GEOMETRY_TYPES,
	);
}

export function validateAdultCollectionLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): AdultCollectionLocationSource {
	return validateLocationSourceFlow(
		input,
		path,
		issues,
		ADULT_COLLECTION_LOCATION_SOURCE_KINDS,
		POINT_GEOMETRY_TYPES,
	);
}

export function validateHabitatLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): HabitatLocationSource {
	return validateLocationSourceFlow(
		input,
		path,
		issues,
		HABITAT_LOCATION_SOURCE_KINDS,
		LOCATABLE_GEOMETRY_TYPES,
	);
}

export function validateAdHocInspectionLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): AdHocInspectionLocationSource {
	return validateLocationSourceFlow(
		input,
		path,
		issues,
		AD_HOC_INSPECTION_LOCATION_SOURCE_KINDS,
		LOCATABLE_GEOMETRY_TYPES,
	);
}

export function validateRequestedControlActionLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): RequestedControlActionLocationSource {
	return validateLocationSourceFlow(
		input,
		path,
		issues,
		REQUESTED_CONTROL_ACTION_LOCATION_SOURCE_KINDS,
		LOCATABLE_GEOMETRY_TYPES,
	);
}

export function validateMissionItemLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): MissionItemLocationSource {
	return validateLocationSourceFlow(
		input,
		path,
		issues,
		MISSION_ITEM_LOCATION_SOURCE_KINDS,
		LOCATABLE_GEOMETRY_TYPES,
	);
}

export function validateControlActionLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): ControlActionLocationSource {
	return validateLocationSourceFlow(
		input,
		path,
		issues,
		CONTROL_ACTION_LOCATION_SOURCE_KINDS,
		LOCATABLE_GEOMETRY_TYPES,
	);
}

export type LocationSourceKind =
	| 'geometry'
	| 'address'
	| 'habitat'
	| 'inspection'
	| 'trap'
	| 'collection'
	| 'serviceRequest'
	| 'requestedControlAction'
	| 'missionItem';

/**
 * Every location source, before a workflow narrows it.
 *
 * The per-workflow unions above are each a subset of this, so a `TrapLocationSource`
 * or a `MissionItemLocationSource` is assignable without a cast. It exists for the
 * server's geometry resolver, whose job is the lookup — which row does this id name,
 * and what is its geometry — and not the whitelist, which the validators above have
 * already applied by the time a command reaches a handler.
 *
 * Resolving over this union rather than over `{ kind: string }` is what makes a new
 * source term a build error in the resolver instead of a 400 at run time.
 */
export type LocationSource =
	| ManualPointGeometrySource
	| ManualLocatableGeometrySource
	| AddressGeometrySource
	| HabitatGeometrySource
	| InspectionGeometrySource
	| TrapGeometrySource
	| CollectionGeometrySource
	| ServiceRequestGeometrySource
	| RequestedControlActionGeometrySource
	| MissionItemGeometrySource;

function validateLocationSourceFlow<TOutput>(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
	allowedKinds: readonly LocationSourceKind[],
	allowedGeometryTypes: readonly SupportedGeometryType[],
): TOutput {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a location source object.` });
		return fallbackLocationSource(allowedGeometryTypes) as TOutput;
	}

	const kind = input.kind;
	if (typeof kind !== 'string' || !allowedKinds.includes(kind as LocationSourceKind)) {
		issues.push({
			path: `${path}.kind`,
			message: `${path}.kind is not supported for this location source flow.`,
		});
		return fallbackLocationSource(allowedGeometryTypes) as TOutput;
	}

	switch (kind) {
		case 'geometry':
			return {
				kind,
				geometry: validateGeometry(
					input.geometry,
					allowedGeometryTypes,
					`${path}.geometry`,
					issues,
				),
			} as TOutput;
		case 'address':
			return {
				kind,
				addressId: requiredUuid(asOptionalString(input.addressId), `${path}.addressId`, issues),
			} as TOutput;
		case 'habitat':
			return {
				kind,
				habitatId: requiredUuid(asOptionalString(input.habitatId), `${path}.habitatId`, issues),
			} as TOutput;
		case 'inspection':
			return {
				kind,
				inspectionId: requiredUuid(
					asOptionalString(input.inspectionId),
					`${path}.inspectionId`,
					issues,
				),
			} as TOutput;
		case 'trap':
			return {
				kind,
				trapId: requiredUuid(asOptionalString(input.trapId), `${path}.trapId`, issues),
			} as TOutput;
		case 'collection':
			return {
				kind,
				collectionId: requiredUuid(
					asOptionalString(input.collectionId),
					`${path}.collectionId`,
					issues,
				),
			} as TOutput;
		case 'serviceRequest':
			return {
				kind,
				serviceRequestId: requiredUuid(
					asOptionalString(input.serviceRequestId),
					`${path}.serviceRequestId`,
					issues,
				),
			} as TOutput;
		case 'requestedControlAction':
			return {
				kind,
				requestedControlActionId: requiredUuid(
					asOptionalString(input.requestedControlActionId),
					`${path}.requestedControlActionId`,
					issues,
				),
			} as TOutput;
		case 'missionItem':
			return {
				kind,
				missionItemId: requiredUuid(
					asOptionalString(input.missionItemId),
					`${path}.missionItemId`,
					issues,
				),
			} as TOutput;
	}
	return fallbackLocationSource(allowedGeometryTypes) as TOutput;
}

function fallbackLocationSource(
	allowedGeometryTypes: readonly SupportedGeometryType[],
): ManualPointGeometrySource | ManualLocatableGeometrySource {
	return {
		kind: 'geometry',
		geometry:
			allowedGeometryTypes[0] === 'Point'
				? { type: 'Point', coordinates: [0, 0] }
				: { type: allowedGeometryTypes[0] ?? 'Point', coordinates: [0, 0] },
	} as ManualPointGeometrySource | ManualLocatableGeometrySource;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | null | undefined {
	return typeof value === 'string' || value === null || value === undefined ? value : undefined;
}
