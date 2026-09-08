import {
	getOwnedGeometryPolicy,
	isOwnedGeometry,
	type OwnedGeometryKind,
	type OwnedGeometryPolicy,
	type OwnedGeometryTypeFor,
} from '@simmer-mosquito/domain';
import {
	formatGeometryTypeLabel,
	type GeoJsonFeature,
	type GeoJsonFeatureCollection,
	type GeoJsonGeometry,
	isGeoJsonGeometryOfTypes,
} from '@simmer-mosquito/mapping';

/**
 * The one place the app's GeoJSON vocabulary is handed to Mapbox's.
 *
 * `packages/mapping` is provider-neutral, so a position below `GeoJsonPosition`
 * is a readonly tuple and every coordinate array above it is readonly too.
 * `@types/geojson`, which arrives transitively through `mapbox-gl`, spells the
 * same values as mutable `number[]`. The two are assignable in neither
 * direction, so a single `as` is rejected with TS2352, and the double cast was
 * the only thing that compiled. That is structural rather than careless, and
 * before this file the workspace paid for it at fourteen call sites.
 *
 * The adapter lives on the app side of the seam rather than in
 * `packages/mapping`, because putting it in the package would give a
 * provider-neutral package a dependency on one provider's types, which is what
 * that package exists to avoid. The app has already named the provider.
 *
 * The two conversions still validate nothing, and callers rely on that:
 * `useGeoJsonSource` holds `data` in an effect dependency, so a copy would
 * re-add the source on every render. Both take either vocabulary, and half of
 * what they take is a feature an overlay composed for itself, which belongs to
 * no record and has no policy to be measured against.
 *
 * {@link checkOwnedGeometry} is the check #761 asked for, and it sits beside them
 * rather than inside them because it needs the one thing the seam type does not
 * carry: which record kind the geometry came off. It is a predicate over the
 * value, so a geometry that passes is the same object the caller already had.
 */

/** GeoJSON in the app's own vocabulary, as `packages/mapping` spells it. */
type MapGeoJson = GeoJsonGeometry | GeoJsonFeature | GeoJsonFeatureCollection;

/**
 * What a map seam accepts: either vocabulary.
 *
 * Both halves are load-bearing. Record surfaces hand down mapping's geometry,
 * read off a synced row and measured by `packages/mapping`. The overlays that
 * compose their own features, the activity cloud and the draw, measure and route
 * sessions among them, build Mapbox shapes for their own reasons and never touch
 * mapping's types.
 *
 * So this widens the seam rather than narrowing it: a prop of this type still
 * does not say which of ADR 0018's six shapes reached it. That is settled one
 * step earlier instead, by {@link checkOwnedGeometry} where the record kind is
 * known, because a prop naming one shape would refuse the overlay half.
 */
export type MapSourceGeoJson = MapGeoJson | GeoJSON.GeoJSON;

/**
 * A geometry, feature or collection, in the shape a Mapbox source takes.
 *
 * `readonly` is the whole reason the conversion cannot be a plain assignment:
 * mapping's coordinates are readonly tuples and Mapbox's are mutable arrays, so
 * the two types do not overlap in TypeScript's sense even though every value
 * reaching here satisfies both at runtime.
 */
export function toMapboxGeoJson(value: MapSourceGeoJson): GeoJSON.GeoJSON;
export function toMapboxGeoJson(value: MapSourceGeoJson | null): GeoJSON.GeoJSON | null;
export function toMapboxGeoJson(value: MapSourceGeoJson | null): GeoJSON.GeoJSON | null {
	return value === null ? null : (value as unknown as GeoJSON.GeoJSON);
}

/**
 * One geometry, for a caller assembling a Mapbox feature around it.
 *
 * Separate from {@link toMapboxGeoJson} because `GeoJSON.GeoJSON` widens to
 * include `Feature` and `FeatureCollection`, which a feature's `geometry` field
 * will not take. Same cast, same reason: `readonly`.
 */
export function toMapboxGeometry(geometry: GeoJsonGeometry): GeoJSON.Geometry {
	return geometry as unknown as GeoJSON.Geometry;
}

/**
 * The shapes `Kind` may store, as mapping spells them.
 *
 * Read off `OWNED_GEOMETRY_POLICIES` at the type level, so it moves the day a
 * policy does. Mapping's names and the register's are structurally the same six,
 * and ADR 0018 says why that copy stays.
 */
export type OwnedMapGeometry<Kind extends OwnedGeometryKind> = Extract<
	GeoJsonGeometry,
	{ readonly type: OwnedGeometryTypeFor<Kind> }
>;

/** A geometry read off a record, and the sentence for one the map will not draw. */
export interface CheckedMapGeometry<Kind extends OwnedGeometryKind> {
	/** The same object that was passed in, when it passed. `null` otherwise. */
	readonly geometry: OwnedMapGeometry<Kind> | null;
	/**
	 * Why the map is drawing nothing, for the record's own surface to print. Null
	 * both when the geometry is good and when the record simply stores none: an
	 * empty Location card already says that, and saying it twice would report a
	 * problem on every record that has no geometry.
	 */
	readonly unsupportedShape: string | null;
}

/**
 * Check a record's stored geometry against the shapes its kind may store.
 *
 * This is the render seam, and it is a real boundary rather than a type restated.
 * The value arrives from `JSON.parse` over an HTTP body: `GeoJsonGeometry` there
 * is a claim the compiler has no way to check, and eight modules made it with a
 * single `as` on a column that can hold a null, a string, or a
 * `GeometryCollection`. Every one of those reached Mapbox, which drops a
 * malformed feature with no error, so the failure looked like a record that had
 * no location.
 *
 * **What it does on a bad shape.** It returns `null` and a sentence, and throws
 * nothing. A throw here would land inside `useGeoJsonSource`'s effect and blank
 * the whole page for one bad column, which is worse than the wrong shape: the
 * record still has a name, an inspection history and an address worth reading.
 * The sentence names the field and the shape found, because a refusal that says
 * only "cannot draw this" leaves nobody able to locate what to fix.
 *
 * **Where it is reported.** The caller hands the sentence to the record's own
 * Location card, not to a banner over the map. A shape the map will not draw is a
 * property of one record, and a map-level banner would name a problem the reader
 * cannot point at. Every caller runs this inside the query that fetched the
 * geometry, so it resolves once per record and per fetch rather than once per
 * render.
 *
 * **Why the same reference.** `useGeoJsonSource` holds `data` in an effect
 * dependency. Handing back a normalized copy would re-add the Mapbox source on
 * every render, so the check is two predicates over the value and the value comes
 * back untouched.
 *
 * The second predicate is `packages/domain`'s. `isGeoJsonGeometryOfTypes` answers
 * the run-time question against the shapes the register lists, and
 * `isOwnedGeometry` is what lets the compiler see the narrowing, which is the
 * same two-step `normalizeOwnedGeometry` takes for a write.
 */
export function checkOwnedGeometry<Kind extends OwnedGeometryKind>(
	kind: Kind,
	value: unknown,
): CheckedMapGeometry<Kind> {
	if (value === null || value === undefined) {
		return { geometry: null, unsupportedShape: null };
	}
	const policy = getOwnedGeometryPolicy(kind);
	if (isGeoJsonGeometryOfTypes(value, policy.allowedTypes) && isOwnedGeometry(kind, value)) {
		return { geometry: value, unsupportedShape: null };
	}
	return { geometry: null, unsupportedShape: describeUnsupportedShape(policy, value) };
}

/**
 * The sentence a record prints instead of its map.
 *
 * It names the field, what was found and what the field takes, all three off the
 * register. The shape names are `formatGeometryTypeLabel`'s, which is what the
 * Location card's own summary line uses, so the two read alike.
 */
function describeUnsupportedShape(policy: OwnedGeometryPolicy, value: unknown): string {
	const accepted = policy.allowedTypes.map(formatGeometryTypeLabel).join(', ');
	const found = storedShapeName(value);
	const opening =
		found === null
			? `${policy.domainName} is not stored as a shape the map can draw.`
			: `${policy.domainName} is stored as ${found}, which the map cannot draw.`;
	return `${opening} It takes ${accepted}.`;
}

/** The `type` a bad value claims, when it claims one at all. */
function storedShapeName(value: unknown): string | null {
	if (typeof value !== 'object' || value === null) {
		return null;
	}
	const type = (value as { readonly type?: unknown }).type;
	if (typeof type !== 'string' || type.trim() === '') {
		return null;
	}
	return formatGeometryTypeLabel(type);
}
