import { requiredUuid } from './command-validation.js';
import {
	type DomainId,
	type DomainValidationIssue,
	type GeoJsonPoint,
	getOwnedGeometryPolicy,
	isOwnedGeometry,
	type OwnedGeoJsonGeometryFor,
	type OwnedGeometryKind,
	type OwnedGeometryTypeFor,
	validateGeometry,
} from './shared.js';

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

/**
 * The source term behind each kind that names a record.
 *
 * An object keyed by kind rather than a union, so a flow's sources can be looked
 * up from the kinds its register row lists. It is also what {@link
 * LocationSourceKind} is read off, which is what stops a term existing with no
 * kind naming it, or a kind naming no term.
 */
export type IdentifiedLocationSourceByKind = {
	readonly address: AddressGeometrySource;
	readonly habitat: HabitatGeometrySource;
	readonly inspection: InspectionGeometrySource;
	readonly trap: TrapGeometrySource;
	readonly collection: CollectionGeometrySource;
	readonly serviceRequest: ServiceRequestGeometrySource;
	readonly requestedControlAction: RequestedControlActionGeometrySource;
	readonly missionItem: MissionItemGeometrySource;
};

export type LocationSourceKind = 'geometry' | keyof IdentifiedLocationSourceByKind;

/** A hand-drawn geometry on the way in, before its shape has been checked. */
export type ManualGeometrySourceInput = {
	readonly kind: 'geometry';
	readonly geometry: unknown;
};

/**
 * A hand-drawn geometry, held to the shapes `Kind` stores.
 *
 * The shape comes from {@link OwnedGeoJsonGeometryFor} and so from
 * `OWNED_GEOMETRY_POLICIES`, which is the only register of what a record kind
 * stores. Each flow used to pick between two hand-written names instead, one for
 * the Point-only flows and one for the rest, so widening a geometry policy
 * widened the run-time check and left the type behind.
 */
export type ManualGeometrySource<Kind extends OwnedGeometryKind> = {
	readonly kind: 'geometry';
	readonly geometry: OwnedGeoJsonGeometryFor<Kind>;
};

/**
 * A geometry kind that can store a Point.
 *
 * Every flow's rejection path answers with a Point: `validateGeometry` returns
 * one once it has pushed an issue, and so does {@link fallbackLocationSource}.
 * Requiring it of the register is what makes those paths fit the flow's own
 * return type, so {@link validateLocationSourceFlow} needs no cast for them.
 * Read off the geometry register, so a policy that stopped storing a Point would
 * fail here rather than at the seam.
 */
type PointBearingGeometryKind = {
	[Kind in OwnedGeometryKind]: 'Point' extends OwnedGeometryTypeFor<Kind> ? Kind : never;
}[OwnedGeometryKind];

/**
 * What one workflow accepts as the place a record sits.
 *
 * `kinds` leads with `geometry` because every flow takes a hand-drawn geometry,
 * and the tuple form is what says so to the compiler rather than to a reader.
 */
interface LocationSourceFlowPolicy {
	readonly kinds: readonly ['geometry', ...LocationSourceKind[]];
	readonly geometryKind: PointBearingGeometryKind;
}

/**
 * Which location sources each workflow permits.
 *
 * This is the register: the single place the rule is written. Each flow used to
 * write it four times, as an `Input` union, an output union, a kind array and a
 * validator, with nothing holding the four together. The joint was twelve casts
 * inside one generic inferred from its return position alone, so adding `trap`
 * to the habitat array made the habitat validator accept a
 * `TrapGeometrySource` and hand it back typed as a `HabitatLocationSource`, and
 * the build stayed green.
 *
 * Keyed by flow rather than listed, so a row is reached by name at the type
 * level and no lookup has to narrow a union back down. `as const satisfies` is
 * what makes that readable: `satisfies` checks each row against {@link
 * LocationSourceFlowPolicy} without widening it, so `kinds` keeps its tuple of
 * literal names and every type below moves the day a row does.
 *
 * `geometryKind` names a row in `OWNED_GEOMETRY_POLICIES` and restates nothing
 * from it. Which shapes a hand-drawn geometry may take is that register's answer
 * and never this one's.
 */
export const LOCATION_SOURCE_FLOWS = {
	trap: { kinds: ['geometry', 'address'], geometryKind: 'trap' },
	adultCollection: { kinds: ['geometry', 'address', 'trap'], geometryKind: 'collection' },
	habitat: { kinds: ['geometry', 'address', 'inspection'], geometryKind: 'habitat' },
	adHocInspection: {
		kinds: ['geometry', 'address', 'habitat', 'serviceRequest'],
		geometryKind: 'inspection',
	},
	requestedControlAction: {
		kinds: ['geometry', 'address', 'habitat', 'trap', 'collection', 'inspection', 'serviceRequest'],
		geometryKind: 'requestedControlAction',
	},
	missionItem: {
		kinds: [
			'geometry',
			'address',
			'habitat',
			'trap',
			'collection',
			'inspection',
			'serviceRequest',
			'requestedControlAction',
		],
		geometryKind: 'missionItem',
	},
	controlAction: {
		kinds: [
			'geometry',
			'address',
			'serviceRequest',
			'habitat',
			'inspection',
			'requestedControlAction',
			'missionItem',
		],
		geometryKind: 'controlAction',
	},
} as const satisfies Readonly<Record<string, LocationSourceFlowPolicy>>;

export type LocationSourceFlowName = keyof typeof LOCATION_SOURCE_FLOWS;

/** The source terms `TFlow` accepts, as the register's own literal names. */
export type LocationSourceKindsFor<TFlow extends LocationSourceFlowName> =
	(typeof LOCATION_SOURCE_FLOWS)[TFlow]['kinds'][number];

/** The row in `OWNED_GEOMETRY_POLICIES` that `TFlow`'s hand-drawn geometry answers to. */
export type LocationSourceGeometryKindFor<TFlow extends LocationSourceFlowName> =
	(typeof LOCATION_SOURCE_FLOWS)[TFlow]['geometryKind'];

/**
 * What `TFlow` accepts on the way in, before validation.
 *
 * The geometry arm is `unknown` because a hand-drawn geometry arrives off the
 * wire and its shape is what {@link validateLocationSourceFlow} decides. Every
 * other arm is already the validated term, since a source that names a record
 * carries an id and nothing else.
 */
export type LocationSourceInputFor<TFlow extends LocationSourceFlowName> =
	| ManualGeometrySourceInput
	| IdentifiedLocationSourceByKind[Exclude<LocationSourceKindsFor<TFlow>, 'geometry'>];

/** What `TFlow` hands back once validated. */
export type LocationSourceFor<TFlow extends LocationSourceFlowName> =
	| ManualGeometrySource<LocationSourceGeometryKindFor<TFlow>>
	| IdentifiedLocationSourceByKind[Exclude<LocationSourceKindsFor<TFlow>, 'geometry'>];

/**
 * The names each flow's callers read.
 *
 * Kept rather than replaced by `LocationSourceFor<'trap'>` at every call site,
 * for the reason `OwnedGeoJsonGeometryFor`'s docblock gives about
 * `RegionGeometry`: a narrow declared name tells a caller which arms cannot be
 * there. What changed is that the compiler now derives them from the register
 * instead of a person restating it, so widening a row widens all three of the
 * output union, the `Input` union and the validator's return in one edit.
 */
export type TrapLocationSourceInput = LocationSourceInputFor<'trap'>;
export type TrapLocationSource = LocationSourceFor<'trap'>;

export type AdultCollectionLocationSourceInput = LocationSourceInputFor<'adultCollection'>;
export type AdultCollectionLocationSource = LocationSourceFor<'adultCollection'>;

export type HabitatLocationSourceInput = LocationSourceInputFor<'habitat'>;
export type HabitatLocationSource = LocationSourceFor<'habitat'>;

export type AdHocInspectionLocationSourceInput = LocationSourceInputFor<'adHocInspection'>;
export type AdHocInspectionLocationSource = LocationSourceFor<'adHocInspection'>;

export type RequestedControlActionLocationSourceInput =
	LocationSourceInputFor<'requestedControlAction'>;
export type RequestedControlActionLocationSource = LocationSourceFor<'requestedControlAction'>;

export type MissionItemLocationSourceInput = LocationSourceInputFor<'missionItem'>;
export type MissionItemLocationSource = LocationSourceFor<'missionItem'>;

export type ControlActionLocationSourceInput = LocationSourceInputFor<'controlAction'>;
export type ControlActionLocationSource = LocationSourceFor<'controlAction'>;

/**
 * Every location source, before a workflow narrows it.
 *
 * The per-workflow unions above are each a subset of this, so a
 * `TrapLocationSource` or a `MissionItemLocationSource` is assignable without a
 * cast. It exists for the server's geometry resolver, whose job is the lookup,
 * which row does this id name and what is its geometry, and not the whitelist,
 * which the validators below have already applied by the time a command reaches
 * a handler.
 *
 * Read off the register across every flow rather than written out, so it is the
 * sources some flow permits by construction. Resolving over this union rather
 * than over `{ kind: string }` is what makes a new source term a build error in
 * the resolver instead of a 400 at run time.
 */
export type LocationSource = LocationSourceFor<LocationSourceFlowName>;

export function validateTrapLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): TrapLocationSource {
	return validateLocationSourceFlow(input, path, issues, 'trap');
}

export function validateAdultCollectionLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): AdultCollectionLocationSource {
	return validateLocationSourceFlow(input, path, issues, 'adultCollection');
}

export function validateHabitatLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): HabitatLocationSource {
	return validateLocationSourceFlow(input, path, issues, 'habitat');
}

export function validateAdHocInspectionLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): AdHocInspectionLocationSource {
	return validateLocationSourceFlow(input, path, issues, 'adHocInspection');
}

export function validateRequestedControlActionLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): RequestedControlActionLocationSource {
	return validateLocationSourceFlow(input, path, issues, 'requestedControlAction');
}

export function validateMissionItemLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): MissionItemLocationSource {
	return validateLocationSourceFlow(input, path, issues, 'missionItem');
}

export function validateControlActionLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
): ControlActionLocationSource {
	return validateLocationSourceFlow(input, path, issues, 'controlAction');
}

/**
 * Validate the location source a command carries, requiring one.
 *
 * One function taking the flow name, where six thin wrappers with the same body
 * and a different validator baked in used to sit, in three domain modules. The
 * return type is derived from the name, so the wrapper widens with its row the
 * way the flow validator does.
 *
 * A missing source is an issue and then a placeholder run through the same
 * validator, rather than a throw, so the sibling fields on the command still
 * collect theirs.
 */
export function validateLocationSourceInput<TFlow extends LocationSourceFlowName>(
	input: { readonly locationSource?: LocationSourceInputFor<TFlow> },
	flow: TFlow,
	issues: DomainValidationIssue[],
): LocationSourceFor<TFlow> {
	if (input.locationSource !== undefined) {
		return validateLocationSourceFlow(input.locationSource, 'locationSource', issues, flow);
	}
	issues.push({ path: 'locationSource', message: 'locationSource is required.' });
	return validateLocationSourceFlow(fallbackLocationSource(), 'locationSource', issues, flow);
}

/**
 * Validate one workflow's location source: which source terms it takes, and
 * which shapes a hand-drawn geometry may be.
 *
 * Both answers come from the register, keyed by the flow name the caller passes,
 * and the return type is read off the same row. The generic used to be inferred
 * from the return position alone, with nothing relating it to the kinds the body
 * checked, and twelve casts on the way out holding the two halves apart.
 */
function validateLocationSourceFlow<TFlow extends LocationSourceFlowName>(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
	flow: TFlow,
): LocationSourceFor<TFlow> {
	const source = readLocationSource(input, path, issues, LOCATION_SOURCE_FLOWS[flow]);
	if (isFlowLocationSource(flow, source)) {
		return source;
	}
	// Unreachable: `readLocationSource` refuses a kind the row does not list and
	// holds a geometry to the shapes its geometry kind stores, and every path out
	// of it that pushed an issue answers with a Point, which every row can store
	// by `PointBearingGeometryKind`. Restating the test is what lets the compiler
	// see the narrowing, and a throw is here rather than a cast so that a register
	// this reader has stopped agreeing with fails loudly instead of quietly.
	throw new Error(`${flow} validated a ${source.kind} location source, which it cannot take.`);
}

/**
 * Whether `source` is one the flow permits.
 *
 * The check reads the register and the type it asserts is read off the same row,
 * so the two move together. A predicate rather than a cast, for the reason
 * `isOwnedGeometry` is one: a cast would be one more place naming a flow's
 * sources by hand, which is the bug this closes.
 */
function isFlowLocationSource<TFlow extends LocationSourceFlowName>(
	flow: TFlow,
	source: LocationSource,
): source is LocationSourceFor<TFlow> {
	const policy = LOCATION_SOURCE_FLOWS[flow];
	if (!policy.kinds.some((kind) => kind === source.kind)) {
		return false;
	}
	return source.kind !== 'geometry' || isOwnedGeometry(policy.geometryKind, source.geometry);
}

/**
 * Read a location source of any kind the policy lists.
 *
 * Untyped by flow on purpose. The switch builds one arm per kind and the
 * compiler checks each against {@link LocationSource}; which of those arms this
 * flow may hold is {@link isFlowLocationSource}'s question, asked once.
 */
function readLocationSource(
	input: unknown,
	path: string,
	issues: DomainValidationIssue[],
	policy: LocationSourceFlowPolicy,
): LocationSource {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a location source object.` });
		return fallbackLocationSource();
	}

	const kind = input.kind;
	if (typeof kind !== 'string' || !policy.kinds.some((allowed) => allowed === kind)) {
		issues.push({
			path: `${path}.kind`,
			message: `${path}.kind is not supported for this location source flow.`,
		});
		return fallbackLocationSource();
	}

	switch (kind) {
		case 'geometry':
			return {
				kind,
				geometry: validateGeometry(
					input.geometry,
					getOwnedGeometryPolicy(policy.geometryKind).allowedTypes,
					`${path}.geometry`,
					issues,
				),
			};
		case 'address':
			return {
				kind,
				addressId: requiredUuid(asOptionalString(input.addressId), `${path}.addressId`, issues),
			};
		case 'habitat':
			return {
				kind,
				habitatId: requiredUuid(asOptionalString(input.habitatId), `${path}.habitatId`, issues),
			};
		case 'inspection':
			return {
				kind,
				inspectionId: requiredUuid(
					asOptionalString(input.inspectionId),
					`${path}.inspectionId`,
					issues,
				),
			};
		case 'trap':
			return {
				kind,
				trapId: requiredUuid(asOptionalString(input.trapId), `${path}.trapId`, issues),
			};
		case 'collection':
			return {
				kind,
				collectionId: requiredUuid(
					asOptionalString(input.collectionId),
					`${path}.collectionId`,
					issues,
				),
			};
		case 'serviceRequest':
			return {
				kind,
				serviceRequestId: requiredUuid(
					asOptionalString(input.serviceRequestId),
					`${path}.serviceRequestId`,
					issues,
				),
			};
		case 'requestedControlAction':
			return {
				kind,
				requestedControlActionId: requiredUuid(
					asOptionalString(input.requestedControlActionId),
					`${path}.requestedControlActionId`,
					issues,
				),
			};
		case 'missionItem':
			return {
				kind,
				missionItemId: requiredUuid(
					asOptionalString(input.missionItemId),
					`${path}.missionItemId`,
					issues,
				),
			};
	}
	return fallbackLocationSource();
}

/**
 * The placeholder that keeps issue collection running past a bad location
 * source.
 *
 * Unconditional, and never observed by a successful write: every call site
 * pushes an issue first and the caller throws once the list is non-empty. It
 * used to synthesize a geometry of the flow's own shape, which was already
 * nonsense for a Polygon and would have grown six arms for no reader. Throwing
 * here instead would lose the issues of sibling fields on the same command.
 *
 * A Point rather than a shape read off the row, which is what
 * `PointBearingGeometryKind` requires of every row so that this fits each flow's
 * own return type.
 */
function fallbackLocationSource(): { readonly kind: 'geometry'; readonly geometry: GeoJsonPoint } {
	return { kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | null | undefined {
	return typeof value === 'string' || value === null || value === undefined ? value : undefined;
}
