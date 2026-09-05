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

/**
 * The six OGC shapes a command may carry.
 *
 * Flat, with no parts wrapper and no base-plus-multiplicity pair. GeoJSON is
 * what crosses the command payload, `st_geomfromgeojson`, the Mapbox source and
 * the import file, so a wrapper would pay a conversion at each of them and the
 * `type` discriminant would come back the moment anything serialized.
 *
 * `packages/mapping` holds a structurally identical union and the two stay
 * apart. They answer different questions: mapping's is "any GeoJSON I might be
 * handed", including the import file and the tile decoder, and this one is "what
 * a command may carry". ADR 0018 has the rest, including why `fallow dupes`
 * seeing the copy is the right call to leave.
 */
export type SupportedGeometryType =
	| 'Point'
	| 'LineString'
	| 'Polygon'
	| 'MultiPoint'
	| 'MultiLineString'
	| 'MultiPolygon';
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

export interface GeoJsonMultiPoint {
	readonly type: 'MultiPoint';
	readonly coordinates: readonly GeoJsonPosition[];
}

export interface GeoJsonMultiLineString {
	readonly type: 'MultiLineString';
	readonly coordinates: readonly (readonly GeoJsonPosition[])[];
}

export interface GeoJsonMultiPolygon {
	readonly type: 'MultiPolygon';
	readonly coordinates: readonly (readonly (readonly GeoJsonPosition[])[])[];
}

export type SupportedGeoJsonGeometry =
	| GeoJsonPoint
	| GeoJsonLineString
	| GeoJsonPolygon
	| GeoJsonMultiPoint
	| GeoJsonMultiLineString
	| GeoJsonMultiPolygon;
export type FoundationGeometryInput = SupportedGeoJsonGeometry;

export const SUPPORTED_GEOMETRY_TYPES = [
	'Point',
	'LineString',
	'Polygon',
	'MultiPoint',
	'MultiLineString',
	'MultiPolygon',
] as const;

/**
 * The shape sets the register hands out, named for the shapes rather than for
 * any one record kind.
 *
 * They are private on purpose. `OWNED_GEOMETRY_POLICIES` is the only thing
 * allowed to say which record stores which shapes, and a shape list exported
 * from here is a second answer waiting to drift from it.
 *
 * `EVERY_SHAPE` reads `SUPPORTED_GEOMETRY_TYPES` rather than spelling the six
 * names again. The eight work-record tables carry
 * `geometry(Geometry,4326)` held to all six names by their CHECK, so the
 * storable set there is the union itself and a copy would be one more list to
 * keep in step.
 */
const POINT_ONLY = ['Point'] as const;
const POINT_OR_POLYGON = ['Point', 'Polygon'] as const;
const AREAL_SHAPES = ['Polygon', 'MultiPolygon'] as const;
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
		allowedTypes: AREAL_SHAPES,
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
		allowedTypes: POINT_OR_POLYGON,
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
 * The shapes `Kind` stores, as a union of the register's own literal names.
 *
 * The type-level half of {@link getOwnedGeometryPolicy}, which answers with the
 * widened `readonly SupportedGeometryType[]` its interface declares. That left a
 * caller narrowing a value against `allowedTypes` with no type to narrow to, so
 * five form predicates checked the register at run time and then wrote `Point`
 * out by hand in the type they asserted. The two agreed by coincidence: widen a
 * policy and the check widens, the assertion does not, and the predicate starts
 * calling a Polygon a Point with nothing failing to compile.
 *
 * `as const satisfies` on the register is what makes this readable. `satisfies`
 * checks each row against {@link OwnedGeometryPolicy} without widening it, so
 * `allowedTypes` keeps its tuple of literal names and this lookup moves the day
 * a policy does.
 */
export type OwnedGeometryTypeFor<Kind extends OwnedGeometryKind> = Extract<
	(typeof OWNED_GEOMETRY_POLICIES)[number],
	{ readonly kind: Kind }
>['allowedTypes'][number];

/**
 * The geometries `Kind` may store, as a union of the six shapes.
 *
 * {@link OwnedGeometryTypeFor} lifted from the shape names to the shapes
 * themselves, so {@link normalizeOwnedGeometry} can hand back what the register
 * says its caller stores. Four validators used to cast that return down to a
 * shape they had written out by hand, which is the same coincidence one layer
 * on: the run time read the register, the type did not, and the `as` was what
 * kept the two from ever being compared.
 *
 * The narrow names those validators declare are kept rather than replaced by
 * this. `CreateRegionCommand.geometry` reading `RegionGeometry` tells a caller
 * which four shapes cannot be there and `SupportedGeoJsonGeometry` tells it
 * nothing, and deriving the name would have widened it with the register, which
 * is where the guarantee lives. What changed is that the compiler now compares
 * the two: widen a policy and the return stops fitting the name, and the build
 * fails inside the validator.
 */
export type OwnedGeoJsonGeometryFor<Kind extends OwnedGeometryKind> = Extract<
	SupportedGeoJsonGeometry,
	{ readonly type: OwnedGeometryTypeFor<Kind> }
>;

/**
 * The base shape behind each storable one.
 *
 * An object keyed by the type union rather than a list, so the compiler requires
 * an entry per shape and a shape added to the union cannot quietly miss one.
 */
const BASE_GEOMETRY_TYPE = {
	Point: 'Point',
	LineString: 'LineString',
	Polygon: 'Polygon',
	MultiPoint: 'Point',
	MultiLineString: 'LineString',
	MultiPolygon: 'Polygon',
} as const satisfies Readonly<Record<SupportedGeometryType, SupportedGeometryType>>;

/**
 * A shape a user draws, and the shape a one-part multi demotes to.
 *
 * Read off {@link BASE_GEOMETRY_TYPE} rather than written out, so it cannot say
 * something different from what demote does. `satisfies` is what keeps the
 * compiler asking for an entry per shape while the values stay literal.
 */
export type BaseGeometryType = (typeof BASE_GEOMETRY_TYPE)[SupportedGeometryType];

/** Whether `value` names a shape that is its own base, so a user can draw it. */
export function isBaseGeometryType(value: unknown): value is BaseGeometryType {
	return isSupportedGeometryType(value) && BASE_GEOMETRY_TYPE[value] === value;
}

/**
 * The base shape behind `type`, which is the shape a user draws it as.
 *
 * A stored MultiPolygon reads back as a Polygon here, which is what the draw
 * control's type toggle has to say: the toggle never offers a multi shape, and a
 * record promotes when a second part is added rather than when a type is picked.
 */
export function getBaseGeometryType(type: SupportedGeometryType): BaseGeometryType {
	return BASE_GEOMETRY_TYPE[type];
}

/**
 * The multi shape `base` promotes to on gaining a second part.
 *
 * The inverse of {@link BASE_GEOMETRY_TYPE}, and a unit case walks the pair back
 * through {@link getBaseGeometryType} so the two cannot disagree about which
 * shape demotes to which.
 */
const MULTIPART_GEOMETRY_TYPE = {
	Point: 'MultiPoint',
	LineString: 'MultiLineString',
	Polygon: 'MultiPolygon',
} as const satisfies Readonly<Record<BaseGeometryType, SupportedGeometryType>>;

/**
 * The shape `base` becomes once it holds more than one part.
 *
 * Generic in `base` so a caller passing a literal gets the literal back, which
 * is what lets the draw control build a `MultiPolygon` without spelling the name
 * a second time.
 */
export function getMultipartGeometryType<Base extends BaseGeometryType>(
	base: Base,
): (typeof MULTIPART_GEOMETRY_TYPE)[Base] {
	return MULTIPART_GEOMETRY_TYPE[base];
}

/**
 * Whether a record of `kind` may store `base` in more than one part.
 *
 * What the draw control's Add piece button is gated on. It reads the register
 * rather than naming the multi shapes, so a policy that gains or loses one moves
 * the button with it: a Notification Registration stores Point and Polygon and
 * neither multi form, so the button never renders there.
 */
export function ownedGeometryAllowsParts(kind: OwnedGeometryKind, base: BaseGeometryType): boolean {
	return getOwnedGeometryPolicy(kind).allowedTypes.includes(MULTIPART_GEOMETRY_TYPE[base]);
}

/**
 * The shapes a user draws for `kind`, in the order the register lists them.
 *
 * `allowedTypes` normalized to base shapes and deduplicated. The derivation is
 * total: every shape has exactly one base, and a record that may store a multi
 * shape may always store the single one beside it.
 */
export function getOwnedGeometryBaseTypes(kind: OwnedGeometryKind): readonly BaseGeometryType[] {
	const bases: BaseGeometryType[] = [];
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
export function normalizeOwnedGeometry<Kind extends OwnedGeometryKind>(
	kind: Kind,
	input: unknown,
	path = 'geometry',
): OwnedGeoJsonGeometryFor<Kind> {
	const geometry = normalizeGeometryForTypes(
		input,
		getOwnedGeometryPolicy(kind).allowedTypes,
		path,
	);
	if (isOwnedGeometry(kind, geometry)) {
		return geometry;
	}
	// Unreachable: `normalizeGeometryForTypes` has already thrown on every shape
	// outside `allowedTypes`. Restating the test is what lets the compiler see the
	// narrowing, and a throw is here rather than a cast so that a register the
	// validator has stopped agreeing with fails loudly instead of quietly.
	throw new Error(`${kind} geometry validated as ${geometry.type}, which it cannot store.`);
}

/**
 * Whether `geometry` is one of the shapes `kind` stores.
 *
 * The check reads the register and the type it asserts is read off the same
 * register, so the two move together. A predicate rather than a cast, because a
 * cast would be one more place naming a shape by hand, which is the bug this
 * closes.
 */
function isOwnedGeometry<Kind extends OwnedGeometryKind>(
	kind: Kind,
	geometry: SupportedGeoJsonGeometry,
): geometry is OwnedGeoJsonGeometryFor<Kind> {
	return getOwnedGeometryPolicy(kind).allowedTypes.includes(geometry.type);
}

export function inferGeometryPrecisionPolicy(
	_geometry: SupportedGeoJsonGeometry,
): GeometryPrecisionPolicy {
	return 'preserve';
}

/**
 * What `validateGeometry` hands back once it has pushed an issue.
 *
 * One value rather than a shape built from `allowedTypes`, because nothing ever
 * reads it: the caller throws as soon as the issue list is non-empty. Building a
 * plausible-looking geometry here would have grown six arms for no reader.
 */
const REJECTED_GEOMETRY: GeoJsonPoint = { type: 'Point', coordinates: [0, 0] };

/**
 * A GeoJSON geometry, held to what the caller may store, with a one-part multi
 * shape demoted to its base shape.
 *
 * Demote runs here and nowhere else. A one-part MultiPolygon never exists once
 * it is stored, so the rewrite is silent: `ogr2ogr` emits MultiPolygon for every
 * feature in a shapefile, including the single-lot ones, which makes a one-part
 * multi a tool artifact rather than a user error. The rejected alternatives, a
 * trigger, `ST_CollectionHomogenize` and a CHECK, are in ADR 0018.
 *
 * It runs before the `allowedTypes` test on purpose. `allowedTypes` is the
 * storable set, and what gets stored is the demoted shape, so a Polygon-only
 * record takes a one-part MultiPolygon and a two-part one is refused.
 *
 * Issues are collected rather than thrown, so a bad geometry does not hide the
 * issues of sibling fields on the same command. The geometry returned beside a
 * non-empty issue list is never observed: every caller throws.
 */
export function validateGeometry(
	input: unknown,
	allowedTypes: readonly SupportedGeometryType[],
	path: string,
	issues: DomainValidationIssue[],
): SupportedGeoJsonGeometry {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a GeoJSON geometry object.` });
		return REJECTED_GEOMETRY;
	}

	const declared = input.type;
	if (!isSupportedGeometryType(declared)) {
		issues.push({ path: `${path}.type`, message: `${path}.type is not supported.` });
		return REJECTED_GEOMETRY;
	}

	const base = BASE_GEOMETRY_TYPE[declared];
	const only = base === declared ? undefined : onlyPartOf(input.coordinates);
	const type = only === undefined ? declared : base;
	const coordinates = only === undefined ? input.coordinates : only.part;
	// The path keeps naming what the caller sent, so an issue inside a demoted
	// part still reads `geometry.coordinates.0`.
	const at = only === undefined ? `${path}.coordinates` : `${path}.coordinates.0`;

	if (!allowedTypes.includes(type)) {
		issues.push({ path: `${path}.type`, message: `${path}.type is not supported.` });
		return REJECTED_GEOMETRY;
	}

	switch (type) {
		case 'Point':
			return { type, coordinates: validatePosition(coordinates, at, issues) };
		case 'LineString':
			return { type, coordinates: validateLineStringCoordinates(coordinates, at, issues) };
		case 'Polygon':
			return { type, coordinates: validatePolygonCoordinates(coordinates, at, issues) };
		case 'MultiPoint':
			return { type, coordinates: validateParts(coordinates, at, issues, validatePosition) };
		case 'MultiLineString':
			return {
				type,
				coordinates: validateParts(coordinates, at, issues, validateLineStringCoordinates),
			};
		case 'MultiPolygon':
			return {
				type,
				coordinates: validateParts(coordinates, at, issues, validatePolygonCoordinates),
			};
	}
}

/**
 * Whether `geometry` covers ground: a line spans some length, a polygon encloses
 * some area net of its holes. Point and MultiPoint are exempt, having no
 * measure, and the position rule already rejects an empty coordinate list.
 *
 * Strictly greater than zero, with no epsilon. A threshold would be a claim
 * about the smallest area an organization treats and nobody has that number.
 *
 * Planar, on raw degrees. The question is whether the shape encloses anything
 * rather than how much, so metres are not the unit of the answer: a ring walked
 * out and back encloses nothing on a plane and nothing on a sphere. That is what
 * keeps this package a leaf, with `ringAreaMeters` left in `packages/mapping`.
 *
 * It reads loosely because it is the backstop in `geojsonToGeom` as well as the
 * rule in `validateGeometry`. A value it cannot read as one of the six shapes is
 * not its refusal to make: `st_geomfromgeojson` answers for that one.
 *
 * `ST_IsValid` is a different rule and stays unpoliced. 15 of 345 production
 * Regions hold self-intersecting rings, so a validity gate would refuse live
 * rows on their next save. That is #437.
 */
export function geometryCoversGround(geometry: unknown): boolean {
	if (!isRecord(geometry)) {
		return true;
	}
	switch (geometry.type) {
		case 'LineString':
			return spansLength(geometry.coordinates);
		case 'MultiLineString':
			return everyPart(geometry.coordinates, spansLength);
		case 'Polygon':
			return enclosesArea(geometry.coordinates);
		case 'MultiPolygon':
			return everyPart(geometry.coordinates, enclosesArea);
		default:
			return true;
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

/**
 * One multi shape's parts, each run through the validator for its base shape.
 *
 * Nothing is reimplemented and nothing is relaxed, so per-part ring closure, the
 * four-position ring minimum and the two-position line minimum come for free.
 *
 * The minimum is one part, not two. Two is the invariant demote enforces, and
 * refusing a one-part multi would refuse exactly the `ogr2ogr` case demote
 * exists to accept. Zero parts has nothing to demote to, so it is an issue.
 */
function validateParts<TPart>(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
	validatePart: (part: unknown, partPath: string, into: DomainValidationIssue[]) => TPart,
): readonly TPart[] {
	if (!Array.isArray(value) || value.length === 0) {
		issues.push({ path, message: `${path} must include at least one part.` });
		return [];
	}
	return value.map((part, index) => validatePart(part, `${path}.${index}`, issues));
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
	const before = issues.length;
	const positions = value.map((position, index) =>
		validatePosition(position, `${path}.${index}`, issues),
	);
	// Only once the positions themselves are sound, so a malformed line is not
	// also told it covers no ground.
	if (issues.length === before && !spansLength(positions)) {
		issues.push({ path, message: `${path} covers no ground.` });
	}
	return positions;
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
	const before = issues.length;
	const rings = validateRings(value, path, issues);
	if (issues.length === before && !enclosesArea(rings)) {
		issues.push({ path, message: `${path} covers no ground.` });
	}
	return rings;
}

function validateRings(
	value: readonly unknown[],
	path: string,
	issues: DomainValidationIssue[],
): readonly (readonly GeoJsonPosition[])[] {
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

/** The single part of a one-part multi shape, or nothing when there is not exactly one. */
function onlyPartOf(coordinates: unknown): { readonly part: unknown } | undefined {
	const parts = asArray(coordinates);
	return parts !== null && parts.length === 1 ? { part: parts[0] } : undefined;
}

function everyPart(parts: unknown, coversGround: (part: unknown) => boolean): boolean {
	const list = asArray(parts);
	return list === null || list.every(coversGround);
}

/** Whether any position of a line differs from its first. */
function spansLength(positions: unknown): boolean {
	const list = asArray(positions);
	const first = list === null ? null : positionOf(list[0]);
	if (list === null || first === null) {
		return true;
	}
	return list.some((value) => {
		const position = positionOf(value);
		return position !== null && (position[0] !== first[0] || position[1] !== first[1]);
	});
}

/** Whether a polygon's outer ring encloses more than its holes take back. */
function enclosesArea(rings: unknown): boolean {
	const list = asArray(rings);
	if (list === null) {
		return true;
	}
	const [outer, ...holes] = list;
	return holes.reduce<number>((net, hole) => net - ringArea(hole), ringArea(outer)) > 0;
}

/** The unsigned shoelace area of a closed ring, in square degrees. */
function ringArea(ring: unknown): number {
	const positions = asArray(ring);
	if (positions === null) {
		return 0;
	}
	let total = 0;
	for (let index = 1; index < positions.length; index += 1) {
		const previous = positionOf(positions[index - 1]);
		const current = positionOf(positions[index]);
		if (previous !== null && current !== null) {
			total += previous[0] * current[1] - current[0] * previous[1];
		}
	}
	return Math.abs(total) / 2;
}

function positionOf(value: unknown): readonly [number, number] | null {
	const position = asArray(value);
	const [longitude, latitude] = position ?? [];
	return isFiniteNumber(longitude) && isFiniteNumber(latitude) ? [longitude, latitude] : null;
}

function asArray(value: unknown): readonly unknown[] | null {
	return Array.isArray(value) ? (value as readonly unknown[]) : null;
}
