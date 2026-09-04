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

/**
 * The shape sets the register hands out, named for the shapes rather than for
 * any one record kind.
 *
 * They are private on purpose. `OWNED_GEOMETRY_POLICIES` is the only thing
 * allowed to say which record stores which shapes, and a shape list exported
 * from here is a second answer waiting to drift from it.
 */
const POINT_ONLY = ['Point'] as const;
const POLYGON_ONLY = ['Polygon'] as const;
const EVERY_SHAPE = SUPPORTED_GEOMETRY_TYPES;

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
	/**
	 * The tables that store this kind's geometry, spelled the way the database
	 * spells them. `controlAction` alone covers four.
	 */
	readonly tables: readonly string[];
	/**
	 * The storable set, and only that. Draw modes are derived from it by
	 * {@link getOwnedGeometryBaseTypes}; a second field for them would be two
	 * hand-written lists on one record, which is the drift this register exists
	 * to delete.
	 */
	readonly allowedTypes: readonly SupportedGeometryType[];
}

/**
 * Which record kind stores which shapes, and in which tables.
 *
 * This is the register: the single place the matrix is written. It used to be
 * decoration beside six other copies of the same facts, none of which was held
 * to any other. `pnpm check:geometry-policies` gates the copies at zero, and a
 * case in `owned-geometry.integration.test.ts` reads the column type and the
 * CHECK back out of the catalog and compares them to `allowedTypes`.
 *
 * Keyed by kind rather than by table because the kind is what the draw control
 * and the validators speak, and a table-keyed register would write the one
 * control-action policy out four times.
 */
export const OWNED_GEOMETRY_POLICIES = [
	{
		kind: 'address',
		domainName: 'Address Geometry',
		tables: ['addresses'],
		allowedTypes: POINT_ONLY,
	},
	{
		kind: 'region',
		domainName: 'Region Geometry',
		tables: ['regions'],
		allowedTypes: POLYGON_ONLY,
	},
	{ kind: 'trap', domainName: 'Trap Geometry', tables: ['traps'], allowedTypes: POINT_ONLY },
	{
		kind: 'collection',
		domainName: 'Collection Geometry',
		tables: ['collections'],
		allowedTypes: POINT_ONLY,
	},
	{
		kind: 'habitat',
		domainName: 'Habitat Geometry',
		tables: ['habitats'],
		allowedTypes: EVERY_SHAPE,
	},
	{
		kind: 'inspection',
		domainName: 'Inspection Geometry',
		tables: ['inspections'],
		allowedTypes: EVERY_SHAPE,
	},
	{
		kind: 'controlAction',
		domainName: 'Control Action Geometry',
		tables: ['applications', 'source_reductions', 'outreach_actions', 'biocontrol_actions'],
		allowedTypes: EVERY_SHAPE,
	},
	{
		kind: 'requestedControlAction',
		domainName: 'Requested Control Action Geometry',
		tables: ['requested_control_actions'],
		allowedTypes: EVERY_SHAPE,
	},
	{
		kind: 'missionItem',
		domainName: 'Mission Item Geometry',
		tables: ['mission_items'],
		allowedTypes: EVERY_SHAPE,
	},
	{
		kind: 'serviceRequest',
		domainName: 'Service Request Geometry',
		tables: ['service_requests'],
		allowedTypes: POINT_ONLY,
	},
	{
		kind: 'notificationRegistration',
		domainName: 'Notification Registration Geometry',
		tables: ['notification_registrations'],
		allowedTypes: EVERY_SHAPE,
	},
	{
		kind: 'weatherStation',
		domainName: 'Weather Station Geometry',
		tables: ['weather_sources'],
		allowedTypes: POINT_ONLY,
	},
] as const satisfies readonly OwnedGeometryPolicy[];

export function getOwnedGeometryPolicy(kind: OwnedGeometryKind): OwnedGeometryPolicy {
	const policy = OWNED_GEOMETRY_POLICIES.find((candidate) => candidate.kind === kind);
	if (policy === undefined) {
		throw new Error(`Unknown owned geometry kind: ${kind}`);
	}
	return policy;
}

/**
 * The base shape behind each storable one.
 *
 * An object keyed by the type union rather than a list, so the compiler requires
 * an entry per shape and a shape added to the union cannot quietly miss one.
 */
const BASE_GEOMETRY_TYPE: Readonly<Record<SupportedGeometryType, SupportedGeometryType>> = {
	Point: 'Point',
	LineString: 'LineString',
	Polygon: 'Polygon',
};

/**
 * The shapes a user draws for `kind`, in the order the register lists them.
 *
 * `allowedTypes` normalized to base shapes and deduplicated. The derivation is
 * total: every shape has exactly one base, and a record that may store a multi
 * shape may always store the single one beside it.
 */
export function getOwnedGeometryBaseTypes(
	kind: OwnedGeometryKind,
): readonly SupportedGeometryType[] {
	const bases: SupportedGeometryType[] = [];
	for (const type of getOwnedGeometryPolicy(kind).allowedTypes) {
		const base = BASE_GEOMETRY_TYPE[type];
		if (!bases.includes(base)) {
			bases.push(base);
		}
	}
	return bases;
}

/**
 * Validate a geometry against what `kind` may store, throwing on anything else.
 *
 * One entry point for every record kind. The three hand-picked normalizers it
 * replaced meant the matrix was keyed by call site, so a widened policy reached
 * a validator only if somebody remembered to change the call.
 */
export function normalizeOwnedGeometry(
	kind: OwnedGeometryKind,
	input: unknown,
	path = 'geometry',
): SupportedGeoJsonGeometry {
	return normalizeGeometryForTypes(input, getOwnedGeometryPolicy(kind).allowedTypes, path);
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

/**
 * Whether `value` names a shape the domain models at all.
 *
 * Exported for the web draw control, whose "can this row's geometry be redrawn"
 * guard was three hand-written type comparisons in each of three files.
 */
export function isSupportedGeometryType(value: unknown): value is SupportedGeometryType {
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
