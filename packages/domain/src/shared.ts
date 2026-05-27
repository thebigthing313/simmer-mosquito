export type DomainId = string;
export type LocalDateString = string;
export type JsonObject = Readonly<Record<string, unknown>>;

export interface DomainValidationIssue {
	readonly path: string;
	readonly message: string;
}

export class DomainValidationError extends Error {
	readonly issues: readonly DomainValidationIssue[];

	constructor(message: string, issues: readonly DomainValidationIssue[]) {
		super(message);
		this.name = 'DomainValidationError';
		this.issues = issues;
	}
}

export type GeometryPrecisionPolicy = 'preserve' | 'snap_5_decimal';
export type SupportedGeometryType = 'Point' | 'LineString' | 'Polygon';
export type GeoJsonPosition =
	| readonly [longitude: number, latitude: number]
	| readonly [longitude: number, latitude: number, altitude: number];

export interface GeoJsonPoint {
	readonly type: 'Point';
	readonly coordinates: GeoJsonPosition;
}

export interface GeoJsonLineString {
	readonly type: 'LineString';
	readonly coordinates: readonly GeoJsonPosition[];
}

export interface GeoJsonPolygon {
	readonly type: 'Polygon';
	readonly coordinates: readonly (readonly GeoJsonPosition[])[];
}

export type SupportedGeoJsonGeometry = GeoJsonPoint | GeoJsonLineString | GeoJsonPolygon;
export type FoundationGeometryInput = SupportedGeoJsonGeometry;

export const SUPPORTED_GEOMETRY_TYPES = ['Point', 'LineString', 'Polygon'] as const;
export const ADDRESS_GEOMETRY_TYPES = ['Point'] as const;
export const REGION_GEOMETRY_TYPES = ['Polygon'] as const;
export const LOCATABLE_GEOMETRY_TYPES = SUPPORTED_GEOMETRY_TYPES;

export type OwnedGeometryKind =
	| 'address'
	| 'region'
	| 'trap'
	| 'collection'
	| 'habitat'
	| 'inspection'
	| 'controlAction'
	| 'requestedControlAction'
	| 'missionItem'
	| 'serviceRequest'
	| 'notificationRegistration'
	| 'weatherStation';

export interface OwnedGeometryPolicy {
	readonly kind: OwnedGeometryKind;
	readonly domainName: string;
	readonly allowedTypes: readonly SupportedGeometryType[];
}

export const OWNED_GEOMETRY_POLICIES = [
	{ kind: 'address', domainName: 'Address Geometry', allowedTypes: ADDRESS_GEOMETRY_TYPES },
	{ kind: 'region', domainName: 'Region Geometry', allowedTypes: REGION_GEOMETRY_TYPES },
	{ kind: 'trap', domainName: 'Trap Geometry', allowedTypes: ADDRESS_GEOMETRY_TYPES },
	{ kind: 'collection', domainName: 'Collection Geometry', allowedTypes: ADDRESS_GEOMETRY_TYPES },
	{ kind: 'habitat', domainName: 'Habitat Geometry', allowedTypes: LOCATABLE_GEOMETRY_TYPES },
	{
		kind: 'inspection',
		domainName: 'Inspection Geometry',
		allowedTypes: LOCATABLE_GEOMETRY_TYPES,
	},
	{
		kind: 'controlAction',
		domainName: 'Control Action Geometry',
		allowedTypes: LOCATABLE_GEOMETRY_TYPES,
	},
	{
		kind: 'requestedControlAction',
		domainName: 'Requested Control Action Geometry',
		allowedTypes: LOCATABLE_GEOMETRY_TYPES,
	},
	{
		kind: 'missionItem',
		domainName: 'Mission Item Geometry',
		allowedTypes: LOCATABLE_GEOMETRY_TYPES,
	},
	{
		kind: 'serviceRequest',
		domainName: 'Service Request Geometry',
		allowedTypes: ADDRESS_GEOMETRY_TYPES,
	},
	{
		kind: 'notificationRegistration',
		domainName: 'Notification Registration Geometry',
		allowedTypes: LOCATABLE_GEOMETRY_TYPES,
	},
	{
		kind: 'weatherStation',
		domainName: 'Weather Station Geometry',
		allowedTypes: ADDRESS_GEOMETRY_TYPES,
	},
] as const satisfies readonly OwnedGeometryPolicy[];

export function getOwnedGeometryPolicy(kind: OwnedGeometryKind): OwnedGeometryPolicy {
	const policy = OWNED_GEOMETRY_POLICIES.find((candidate) => candidate.kind === kind);
	if (policy === undefined) {
		throw new Error(`Unknown owned geometry kind: ${kind}`);
	}
	return policy;
}

export function normalizePointGeometry(input: unknown, path = 'geometry'): GeoJsonPoint {
	return normalizeGeometryForTypes(input, ADDRESS_GEOMETRY_TYPES, path) as GeoJsonPoint;
}

export function normalizePolygonGeometry(input: unknown, path = 'geometry'): GeoJsonPolygon {
	return normalizeGeometryForTypes(input, REGION_GEOMETRY_TYPES, path) as GeoJsonPolygon;
}

export function normalizeLocatableGeometry(
	input: unknown,
	path = 'geometry',
): SupportedGeoJsonGeometry {
	return normalizeGeometryForTypes(input, LOCATABLE_GEOMETRY_TYPES, path);
}

export function normalizeGeometry(
	input: unknown,
	allowedTypes: readonly SupportedGeometryType[] = SUPPORTED_GEOMETRY_TYPES,
	path = 'geometry',
): SupportedGeoJsonGeometry {
	return normalizeGeometryForTypes(input, allowedTypes, path);
}

export function inferGeometryPrecisionPolicy(
	_geometry: SupportedGeoJsonGeometry,
): GeometryPrecisionPolicy {
	return 'preserve';
}

export function validateGeometry(
	input: unknown,
	allowedTypes: readonly SupportedGeometryType[],
	path: string,
	issues: DomainValidationIssue[],
): SupportedGeoJsonGeometry {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a GeoJSON geometry object.` });
		return { type: 'Point', coordinates: [0, 0] };
	}

	const type = input.type;
	if (!isSupportedGeometryType(type) || !allowedTypes.includes(type)) {
		issues.push({ path: `${path}.type`, message: `${path}.type is not supported.` });
		return { type: allowedTypes[0] ?? 'Point', coordinates: [0, 0] } as SupportedGeoJsonGeometry;
	}

	switch (type) {
		case 'Point':
			return {
				type,
				coordinates: validatePosition(input.coordinates, `${path}.coordinates`, issues),
			};
		case 'LineString':
			return {
				type,
				coordinates: validateLineStringCoordinates(
					input.coordinates,
					`${path}.coordinates`,
					issues,
				),
			};
		case 'Polygon':
			return {
				type,
				coordinates: validatePolygonCoordinates(input.coordinates, `${path}.coordinates`, issues),
			};
	}
}

function normalizeGeometryForTypes(
	input: unknown,
	allowedTypes: readonly SupportedGeometryType[],
	path: string,
): SupportedGeoJsonGeometry {
	const issues: DomainValidationIssue[] = [];
	const geometry = validateGeometry(input, allowedTypes, path, issues);
	if (issues.length > 0) {
		throw new DomainValidationError('Geometry is invalid.', issues);
	}
	return geometry;
}

function validateLineStringCoordinates(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): readonly GeoJsonPosition[] {
	if (!Array.isArray(value) || value.length < 2) {
		issues.push({ path, message: `${path} must include at least two positions.` });
		return [];
	}
	return value.map((position, index) => validatePosition(position, `${path}.${index}`, issues));
}

function validatePolygonCoordinates(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): readonly (readonly GeoJsonPosition[])[] {
	if (!Array.isArray(value) || value.length === 0) {
		issues.push({ path, message: `${path} must include at least one linear ring.` });
		return [];
	}
	return value.map((ring, ringIndex) => {
		const ringPath = `${path}.${ringIndex}`;
		if (!Array.isArray(ring) || ring.length < 4) {
			issues.push({ path: ringPath, message: `${ringPath} must include at least four positions.` });
			return [];
		}
		const positions = ring.map((position, index) =>
			validatePosition(position, `${ringPath}.${index}`, issues),
		);
		const first = positions[0];
		const last = positions.at(-1);
		if (
			first !== undefined &&
			last !== undefined &&
			(first[0] !== last[0] || first[1] !== last[1] || (first[2] ?? null) !== (last[2] ?? null))
		) {
			issues.push({
				path: ringPath,
				message: `${ringPath} must be closed with matching first and last positions.`,
			});
		}
		return positions;
	});
}

function validatePosition(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): GeoJsonPosition {
	if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) {
		issues.push({ path, message: `${path} must be [longitude, latitude] or include altitude.` });
		return [0, 0];
	}
	const [longitude, latitude, altitude] = value;
	if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
		issues.push({ path: `${path}.0`, message: 'longitude must be between -180 and 180.' });
	}
	if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
		issues.push({ path: `${path}.1`, message: 'latitude must be between -90 and 90.' });
	}
	if (value.length === 3 && !isFiniteNumber(altitude)) {
		issues.push({ path: `${path}.2`, message: 'altitude must be finite when provided.' });
	}
	return value.length === 3
		? [Number(longitude), Number(latitude), Number(altitude)]
		: [Number(longitude), Number(latitude)];
}

function isSupportedGeometryType(value: unknown): value is SupportedGeometryType {
	return (
		typeof value === 'string' && SUPPORTED_GEOMETRY_TYPES.includes(value as SupportedGeometryType)
	);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
