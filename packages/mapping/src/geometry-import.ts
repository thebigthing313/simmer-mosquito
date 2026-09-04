/**
 * Client-side parsing of geometry out of an uploaded KML, KMZ, or GeoJSON file.
 * Everything here is dependency-free: GeoJSON via `JSON.parse`, KML via the
 * browser's built-in `DOMParser`, and KMZ via `./kmz.js`.
 *
 * One source feature is one shape. A GeoJSON `Feature` or a KML `<Placemark>`
 * carrying several pieces keeps them, as the multi shape they make; a feature
 * carrying one piece comes back as the plain shape, whatever the file called it.
 * Splitting a MultiPolygon into a shape per piece is what this used to do, and
 * it turned a park on three lots into three records without saying so.
 *
 * Callers say which kinds they want, read off the geometry register in
 * `@simmer-mosquito/domain`. A feature of a kind nobody asked for is counted as
 * skipped; a feature whose pieces the caller cannot store, and one mixing kinds,
 * are refused with a reason of their own, so a preview can say why a shape it
 * found is not on offer.
 *
 * Two consumers share this: the bulk region import (`gis/regions/import`, which
 * turns every feature in the file into a region) and the record forms' "fill
 * geometry from a file" convenience, which lets the user pick one shape.
 *
 * All six OGC shapes are read, points included, so a Trap or a Service Request
 * can be located from a file the same way a Region is. KML spells a point
 * `<Point>` and has no name for a set of them: several `<Point>` tags in one
 * `<MultiGeometry>` are the multipoint.
 *
 * Reading a file (`readImportFileText`) is separate from parsing its text
 * (`collectImportGroups`) because only reading is asynchronous, and because the
 * pasted-GeoJSON path in `apps/admin` has text and no file. Only `parseKmlGroups`
 * touches the DOM, which is why its cases sit in `geometry-import.kml.test.ts`
 * under jsdom and the rest run on bare Node.
 */

import { extractKmlFromKmz, isZipArchive } from './kmz.js';

export type ImportPosition = [number, number];

export interface ImportPointGeometry {
	readonly type: 'Point';
	readonly coordinates: ImportPosition;
}

export interface ImportMultiPointGeometry {
	readonly type: 'MultiPoint';
	readonly coordinates: ImportPosition[];
}

export interface ImportPolygonGeometry {
	readonly type: 'Polygon';
	/** `[outer ring, ...holes]`, each closed (first position repeated last). */
	readonly coordinates: ImportPosition[][];
}

export interface ImportLineGeometry {
	readonly type: 'LineString';
	readonly coordinates: ImportPosition[];
}

export interface ImportMultiPolygonGeometry {
	readonly type: 'MultiPolygon';
	/** One `[outer ring, ...holes]` list per piece. */
	readonly coordinates: ImportPosition[][][];
}

export interface ImportMultiLineGeometry {
	readonly type: 'MultiLineString';
	readonly coordinates: ImportPosition[][];
}

/** A shape carrying exactly one piece, which is what a piece is on its own. */
export type ImportBaseGeometry = ImportPointGeometry | ImportPolygonGeometry | ImportLineGeometry;

export type ImportGeometry =
	| ImportPointGeometry
	| ImportPolygonGeometry
	| ImportLineGeometry
	| ImportMultiPointGeometry
	| ImportMultiPolygonGeometry
	| ImportMultiLineGeometry;

/** The areal shapes: one polygon, or several carried as one. */
export type ImportArealGeometry = ImportPolygonGeometry | ImportMultiPolygonGeometry;

export type ImportGeometryKind = ImportGeometry['type'];

/**
 * The single-piece kind behind each kind, mirroring the register's own base map.
 *
 * An object keyed by the union rather than a list of names, so the compiler
 * requires an entry per kind and the KML tag check below cannot fall out of step
 * with what the parser actually reads.
 */
const IMPORT_BASE_KIND = {
	Point: 'Point',
	Polygon: 'Polygon',
	LineString: 'LineString',
	MultiPoint: 'Point',
	MultiPolygon: 'Polygon',
	MultiLineString: 'LineString',
} as const satisfies Readonly<Record<ImportGeometryKind, ImportGeometryKind>>;

export type ImportBaseGeometryKind = ImportBaseGeometry['type'];

/**
 * Whether `value` names a geometry kind this parser can produce.
 *
 * Callers derive their `kinds` argument from the geometry register in
 * `@simmer-mosquito/domain` and filter the register's answer through this. The
 * two unions hold the same six names today, so nothing is dropped, but they are
 * separate types on separate packages: mapping is dependency-free and takes no
 * dependency on the domain. This is the seam between the register's vocabulary
 * and the parser's, and it is what a shape the parser cannot read would fall out
 * of.
 */
export function isImportGeometryKind(value: string): value is ImportGeometryKind {
	return Object.hasOwn(IMPORT_BASE_KIND, value);
}

/**
 * The single-piece kind behind `kind`.
 *
 * What the dialog's noun is read off: a caller allowing Polygon and MultiPolygon
 * allows one kind of thing, and says "polygon" rather than falling back to the
 * general word.
 */
export function importBaseGeometryKind(kind: ImportGeometryKind): ImportBaseGeometryKind {
	return IMPORT_BASE_KIND[kind];
}

/**
 * Whether `tagName` is a KML element holding one geometry.
 *
 * The tags KML uses are spelled exactly as the single-piece kinds are, and KML
 * has no tag for a multi shape at all: several pieces arrive as several tags
 * inside a `<MultiGeometry>`.
 */
function isKmlGeometryTag(tagName: string): tagName is ImportBaseGeometryKind {
	return IMPORT_BASE_KIND[tagName as ImportGeometryKind] === tagName;
}

/**
 * Why a source feature's geometry is not on offer.
 *
 * A refusal is a note the preview states, not a row it hides. Making a refused
 * feature simply absent is the failure the per-feature rewrite exists to delete:
 * the user picks a parks file, the park they came for is not in the list, and
 * nothing says why.
 */
export type ImportRefusal =
	/** Of a kind the caller never wanted, or one this parser has no arm for. */
	| 'unsupported'
	/** Several pieces, on a caller that stores one. */
	| 'multipart'
	/** A GeoJSON GeometryCollection, or a KML `<MultiGeometry>` mixing kinds. */
	| 'mixed';

/**
 * One source feature — a GeoJSON `Feature` or a KML `<Placemark>` — as one shape.
 *
 * Exactly one of `geometry` and `refusal` is set: a feature is either on offer or
 * refused with a reason.
 */
export interface ImportGroup {
	readonly name: string | null;
	readonly geometry: ImportGeometry | null;
	readonly refusal: ImportRefusal | null;
}

export interface ImportGroupResult {
	readonly groups: ImportGroup[];
	/** Set when the file could not be parsed at all. */
	readonly error?: string;
}

/** A single named shape a caller can offer the user or import. */
export interface ImportCandidate {
	readonly name: string;
	readonly geometry: ImportGeometry;
}

export interface ImportCandidateResult {
	readonly candidates: ImportCandidate[];
	/** Features of an unwanted kind (points, lines under a polygon ask). */
	readonly skipped: number;
	/** Features refused because they hold several pieces and the caller stores one. */
	readonly multipart: number;
	/** Features refused because they mix geometry kinds. */
	readonly mixed: number;
	/** True when the file held more than `limit` features and only the first were kept. */
	readonly truncated: boolean;
}

/**
 * What to put in a file input's `accept` for an import this module can read.
 *
 * It lives beside the reader because the reader is what decides — three copies
 * of this string had already drifted apart on extension order and on whether
 * `application/json` was listed, and only one of them was the truth. Note that
 * `accept` is a filter on the picker, not a guarantee: `readImportFileText`
 * still decides on the bytes.
 */
export const IMPORT_FILE_ACCEPT = [
	'.kml',
	'.kmz',
	'.geojson',
	'.json',
	'application/geo+json',
	'application/json',
	'application/vnd.google-earth.kml+xml',
	'application/vnd.google-earth.kmz',
].join(',');

/**
 * Read an uploaded file into the text `collectImportGroups` parses.
 *
 * A KMZ is a zipped KML, so its document is unpacked here and the rest of the
 * file is never parsed. The archive is recognised by its bytes rather than its
 * extension: agencies pass these files around by email and a `.kmz` saved as
 * `.kml` (or the reverse) is common enough that the extension is not evidence.
 *
 * Throws when the archive can't be read; the message names what is wrong with
 * the file, so callers can render it as-is.
 */
export async function readImportFileText(file: Blob): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	return isZipArchive(bytes) ? extractKmlFromKmz(bytes) : new TextDecoder().decode(bytes);
}

/**
 * Parse an uploaded file into geometry groups. KML is detected by extension or a
 * leading `<`; anything else is read as GeoJSON. Parse failures come back as an
 * `error` rather than a throw, so callers can render them.
 *
 * A `.kmz` name reaches here on the KML the archive held, unpacked by
 * `readImportFileText`, so it routes down the same path as a bare `.kml`.
 */
export function collectImportGroups(
	text: string,
	fileName: string,
	kinds: readonly ImportGeometryKind[],
): ImportGroupResult {
	const looksKml = /\.km[lz]$/i.test(fileName) || text.trimStart().startsWith('<');
	try {
		return { groups: looksKml ? parseKmlGroups(text, kinds) : parseGeoJsonGroups(text, kinds) };
	} catch (error) {
		return {
			groups: [],
			error: error instanceof Error ? error.message : 'Unable to parse the file.',
		};
	}
}

/**
 * Turn groups into named candidates, one per feature, capped at `limit`. An
 * unnamed feature falls back to `fallbackName N`.
 *
 * The cap bounds writes, and the write count is the feature count, so a file of
 * 400 features averaging three pieces each now costs 400 rather than 1200.
 */
export function importCandidatesFrom(
	groups: readonly ImportGroup[],
	options: { readonly limit: number; readonly fallbackName: string },
): ImportCandidateResult {
	const candidates: ImportCandidate[] = [];
	const refused: Record<ImportRefusal, number> = { unsupported: 0, multipart: 0, mixed: 0 };
	let truncated = false;

	for (const group of groups) {
		if (group.geometry === null) {
			if (group.refusal !== null) {
				refused[group.refusal] += 1;
			}
			continue;
		}
		if (candidates.length >= options.limit) {
			// More features remain in the file; keep only the first `limit`.
			truncated = true;
			break;
		}
		candidates.push({
			name: group.name ?? `${options.fallbackName} ${candidates.length + 1}`,
			geometry: group.geometry,
		});
	}

	return {
		candidates,
		skipped: refused.unsupported,
		multipart: refused.multipart,
		mixed: refused.mixed,
		truncated,
	};
}

/**
 * Every ring of `geometry`, pieces and holes alike, in stored order.
 *
 * The one place a shape is taken apart here, so "does this land on earth" and
 * "how big is it" cannot disagree about what the shape holds. A line is one ring
 * for this purpose: an open one, but a list of positions all the same. So is a
 * multipoint, whose positions never join up at all.
 */
function importRings(geometry: ImportGeometry): readonly (readonly ImportPosition[])[] {
	switch (geometry.type) {
		case 'Point':
			return [[geometry.coordinates]];
		case 'MultiPoint':
		case 'LineString':
			return [geometry.coordinates];
		case 'MultiLineString':
			return geometry.coordinates;
		default:
			return arealParts(geometry).flat();
	}
}

/** The pieces `geometry` holds: one for a plain shape, however many a multi has. */
export function importPartCount(geometry: ImportGeometry): number {
	switch (geometry.type) {
		case 'MultiPoint':
		case 'MultiPolygon':
		case 'MultiLineString':
			return geometry.coordinates.length;
		default:
			return 1;
	}
}

/**
 * True when every position is a plausible WGS84 `[lng, lat]` pair.
 *
 * Agency exports are often in a projected CRS (State Plane feet, UTM metres),
 * whose coordinates parse as valid GeoJSON but land nowhere on earth — the
 * server's geometry validation rejects them, and the map would fly to nothing.
 * Catching it here lets a caller say so before the user fills out a whole form.
 *
 * Every piece, not the first one. Reading a multi shape as a single-part one
 * destructured a whole piece into `lng`, so the comparison was `NaN` and every
 * multipart feature was silently withheld as projected.
 */
export function isWgs84Geometry(geometry: ImportGeometry): boolean {
	return importRings(geometry).every((ring) =>
		ring.every(([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90),
	);
}

/**
 * Vertices a user would count, over every piece.
 *
 * A polygon's closing position is not counted twice, and a hole is not counted
 * at all: the draw control's piece rows count the outline and name holes
 * separately, and one number for the same shape in two places has to mean the
 * same thing in both. An area is the only shape with either, so it is the arm
 * that reads pieces and everything else counts the positions it holds: a point
 * has one, a multipoint one per piece.
 */
export function importVertexCount(geometry: ImportGeometry): number {
	if (IMPORT_BASE_KIND[geometry.type] === 'Polygon') {
		return arealParts(geometry).reduce(
			(total, rings) => total + Math.max((rings[0]?.length ?? 0) - 1, 0),
			0,
		);
	}
	return importRings(geometry).reduce((total, ring) => total + ring.length, 0);
}

/** The `[outer ring, ...holes]` list of each piece of an areal shape. */
function arealParts(geometry: ImportGeometry): readonly (readonly (readonly ImportPosition[])[])[] {
	if (geometry.type === 'MultiPolygon') {
		return geometry.coordinates;
	}
	return geometry.type === 'Polygon' ? [geometry.coordinates] : [];
}

// ---------------------------------------------------------------------------
// GeoJSON
// ---------------------------------------------------------------------------

export function parseGeoJsonGroups(
	text: string,
	kinds: readonly ImportGeometryKind[],
): ImportGroup[] {
	return collectGeoJson(JSON.parse(text) as unknown, kinds);
}

function collectGeoJson(node: unknown, kinds: readonly ImportGeometryKind[]): ImportGroup[] {
	if (!isRecord(node) || typeof node.type !== 'string') {
		return [];
	}
	if (node.type === 'FeatureCollection' && Array.isArray(node.features)) {
		return node.features.flatMap((feature) => collectGeoJson(feature, kinds));
	}
	if (node.type === 'Feature') {
		return [
			importGroup(readGeoJsonName(node.properties), readGeoJsonGeometry(node.geometry), kinds),
		];
	}
	// A bare geometry object.
	return [importGroup(null, readGeoJsonGeometry(node), kinds)];
}

/**
 * One feature's geometry, held to what the caller may store.
 *
 * The single place the kinds gate is applied, so both parsers answer it the same
 * way. A multi shape the caller cannot store but whose single form it can is
 * refused by name rather than folded into the generic skipped count: only that
 * case is worth a sentence, because it is the one where the user can see the
 * shape in their file and would otherwise never learn why it is missing.
 */
function importGroup(
	name: string | null,
	read: ImportGeometry | ImportRefusal,
	kinds: readonly ImportGeometryKind[],
): ImportGroup {
	if (typeof read === 'string') {
		return { name, geometry: null, refusal: read };
	}
	if (kinds.includes(read.type)) {
		return { name, geometry: read, refusal: null };
	}
	const base = IMPORT_BASE_KIND[read.type];
	const refusal = base !== read.type && kinds.includes(base) ? 'multipart' : 'unsupported';
	return { name, geometry: null, refusal };
}

/**
 * A GeoJSON geometry as the one shape its feature holds.
 *
 * A multi shape keeps its pieces, and one holding a single piece comes back as
 * the plain shape: `ogr2ogr` emits MultiPolygon for every feature in a
 * shapefile, single-lot ones included, so a one-piece multi is a tool artifact
 * rather than something the user chose. That mirrors the demote the domain
 * builders run, which is what lets a Polygon-only record take such a file.
 *
 * A GeometryCollection is refused. Recursing into one and taking what it held
 * dissolves a feature into pieces of unrelated kinds, which is the silent drop
 * this parser stopped doing.
 */
function readGeoJsonGeometry(geometry: unknown): ImportGeometry | ImportRefusal {
	if (!isRecord(geometry) || typeof geometry.type !== 'string') {
		return 'unsupported';
	}
	if (geometry.type === 'GeometryCollection') {
		return 'mixed';
	}
	return isImportGeometryKind(geometry.type)
		? READ_GEOJSON_COORDINATES[geometry.type](geometry.coordinates)
		: 'unsupported';
}

/**
 * How each kind's raw `coordinates` are read, keyed by the kind.
 *
 * A table rather than a switch, so the compiler asks for an arm per kind: a
 * missing case in a switch reads as the default and a feature of that kind comes
 * back unsupported, which looks exactly like a file the caller did not want.
 *
 * Each pair runs one normalizer. The plain kind wraps its coordinates as the one
 * piece they are and the multi kind already holds a list of pieces, so what the
 * two arms differ by is the wrapping and nothing else.
 */
const READ_GEOJSON_COORDINATES = {
	Point: (coordinates) => pointFromParts(normalizedParts([coordinates], normalizePosition)),
	MultiPoint: (coordinates) => pointFromParts(normalizedParts(coordinates, normalizePosition)),
	Polygon: (coordinates) => polygonFromParts(normalizedParts([coordinates], normalizeRings)),
	MultiPolygon: (coordinates) => polygonFromParts(normalizedParts(coordinates, normalizeRings)),
	LineString: (coordinates) => lineFromParts(normalizedParts([coordinates], normalizeLine)),
	MultiLineString: (coordinates) => lineFromParts(normalizedParts(coordinates, normalizeLine)),
} as const satisfies Readonly<
	Record<ImportGeometryKind, (coordinates: unknown) => ImportGeometry | ImportRefusal>
>;

/** Every piece a raw coordinate list yields, the ones that read as nothing dropped. */
function normalizedParts<TPart>(
	coordinates: unknown,
	normalize: (part: unknown) => TPart | null,
): TPart[] {
	if (!Array.isArray(coordinates)) {
		return [];
	}
	return coordinates.flatMap((part) => {
		const normalized = normalize(part);
		return normalized === null ? [] : [normalized];
	});
}

/** A point feature's pieces as one shape: Point at one, MultiPoint above. */
function pointFromParts(parts: readonly ImportPosition[]): ImportGeometry | ImportRefusal {
	const first = parts[0];
	if (first === undefined) {
		return 'unsupported';
	}
	return parts.length === 1
		? { type: 'Point', coordinates: first }
		: { type: 'MultiPoint', coordinates: [...parts] };
}

/** An areal feature's pieces as one shape: Polygon at one, MultiPolygon above. */
function polygonFromParts(parts: readonly ImportPosition[][][]): ImportGeometry | ImportRefusal {
	const first = parts[0];
	if (first === undefined) {
		return 'unsupported';
	}
	return parts.length === 1
		? { type: 'Polygon', coordinates: first }
		: { type: 'MultiPolygon', coordinates: [...parts] };
}

/** A linear feature's pieces as one shape: LineString at one, MultiLineString above. */
function lineFromParts(parts: readonly ImportPosition[][]): ImportGeometry | ImportRefusal {
	const first = parts[0];
	if (first === undefined) {
		return 'unsupported';
	}
	return parts.length === 1
		? { type: 'LineString', coordinates: first }
		: { type: 'MultiLineString', coordinates: [...parts] };
}

function readGeoJsonName(properties: unknown): string | null {
	if (!isRecord(properties)) {
		return null;
	}
	for (const key of ['name', 'Name', 'NAME', 'title', 'label']) {
		const value = properties[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}
	return null;
}

/**
 * Coerce raw coordinate arrays into `[ring, ...holes]` of `[lng, lat]` pairs.
 * Rings are closed here, so a file that leaves the closing position off still
 * produces a polygon PostGIS accepts.
 *
 * There is no position minimum. The one that used to sit here counted positions,
 * so four copies of one corner passed a filter that read as if it caught them.
 * Whether a shape covers ground is `geometryCoversGround`'s question, and it is
 * asked where the shape is written rather than guessed at here.
 */
function normalizeRings(coordinates: unknown): ImportPosition[][] | null {
	if (!Array.isArray(coordinates)) {
		return null;
	}
	const rings: ImportPosition[][] = [];
	for (const ring of coordinates) {
		const positions = normalizeLine(ring);
		if (positions === null) {
			return null;
		}
		rings.push(closeRing(positions));
	}
	return rings.length === 0 ? null : rings;
}

/**
 * Coerce one raw position into an `[lng, lat]` pair; null if it is malformed.
 *
 * Altitude, which GeoJSON allows as a third number, is dropped: nothing this
 * app stores reads one, and PostGIS would keep it on the geometry.
 */
function normalizePosition(coordinates: unknown): ImportPosition | null {
	if (!Array.isArray(coordinates)) {
		return null;
	}
	const [lng, lat] = coordinates as unknown[];
	if (typeof lng !== 'number' || typeof lat !== 'number') {
		return null;
	}
	return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

/** Coerce a raw position array into `[lng, lat]` pairs; null if any is malformed. */
function normalizeLine(coordinates: unknown): ImportPosition[] | null {
	if (!Array.isArray(coordinates)) {
		return null;
	}
	const positions: ImportPosition[] = [];
	for (const point of coordinates) {
		const position = normalizePosition(point);
		if (position === null) {
			return null;
		}
		positions.push(position);
	}
	return positions.length < 2 ? null : positions;
}

function closeRing(positions: readonly ImportPosition[]): ImportPosition[] {
	const first = positions[0];
	const last = positions.at(-1);
	if (first === undefined || last === undefined) {
		return [...positions];
	}
	return first[0] === last[0] && first[1] === last[1]
		? [...positions]
		: [...positions, [first[0], first[1]]];
}

// ---------------------------------------------------------------------------
// KML
// ---------------------------------------------------------------------------

function parseKmlGroups(text: string, kinds: readonly ImportGeometryKind[]): ImportGroup[] {
	if (typeof DOMParser === 'undefined') {
		throw new Error('KML parsing is only available in the browser.');
	}
	const doc = parseKmlDocument(text);
	const groups: ImportGroup[] = [];
	collectKmlGroups(doc.documentElement, kinds, groups);
	return groups;
}

/**
 * Parse KML into a DOM. Strict `application/xml` parsing is tried first; if it fails,
 * we attempt one repair pass for the most common real-world defect — namespace
 * prefixes (e.g. `xsi:`) used without a matching `xmlns:` declaration, which some
 * exports (ArcGIS, older Google tools) emit and which is not namespace-well-formed.
 */
function parseKmlDocument(text: string): Document {
	const parser = new DOMParser();
	const doc = parser.parseFromString(text, 'application/xml');
	if (doc.getElementsByTagName('parsererror').length === 0) {
		return doc;
	}
	const repaired = declareMissingNamespaces(text);
	if (repaired !== null) {
		const retry = parser.parseFromString(repaired, 'application/xml');
		if (retry.getElementsByTagName('parsererror').length === 0) {
			return retry;
		}
	}
	throw new Error('The file is not valid KML/XML.');
}

/**
 * Find namespace prefixes that are used (`prefix:local` on an element or attribute)
 * but never declared (`xmlns:prefix=...`), and declare each on the root element so a
 * strict XML re-parse succeeds. Returns null when nothing is missing (no repair to try).
 * Declarations are only added, never removed, so the result is always well-formed.
 */
export function declareMissingNamespaces(text: string): string | null {
	const declared = new Set<string>();
	for (const match of text.matchAll(/\sxmlns:([A-Za-z_][\w.-]*)\s*=/g)) {
		declared.add(match[1] as string);
	}
	const missing = new Set<string>();
	// A prefix used in markup is preceded by `<` (element) or whitespace (attribute).
	// The leading `[<\s]` avoids matching URL schemes inside quoted values (`"http:...`).
	for (const match of text.matchAll(/[<\s]([A-Za-z_][\w.-]*):[A-Za-z_]/g)) {
		const prefix = match[1] as string;
		if (prefix !== 'xml' && prefix !== 'xmlns' && !declared.has(prefix)) {
			missing.add(prefix);
		}
	}
	if (missing.size === 0) {
		return null;
	}
	// Inject the declarations into the first element's open tag (the root); the
	// alternation lets attribute values that contain `>` be skipped safely.
	const rootOpen = /<[A-Za-z_][\w.-]*(?:[^>"']|"[^"]*"|'[^']*')*>/.exec(text);
	if (rootOpen === null) {
		return null;
	}
	const decls = [...missing]
		.map((prefix) => ` xmlns:${prefix}="urn:x-simmer-import:${prefix}"`)
		.join('');
	const openTag = rootOpen[0];
	const patchedTag = `${openTag.slice(0, -1)}${decls}>`;
	return text.slice(0, rootOpen.index) + patchedTag + text.slice(rootOpen.index + openTag.length);
}

/**
 * Walk the KML tree to whatever depth Placemarks and geometries live at. KML nests
 * geometry under arbitrary `<Document>`/`<Folder>` levels and inside
 * `<MultiGeometry>`, so we never assume a fixed depth:
 *  - A `<Placemark>` is one grouping unit: every geometry beneath it (including
 *    inside a MultiGeometry) becomes one named entry, and we stop descending.
 *  - A loose geometry outside any Placemark becomes its own unnamed entry.
 *  - Any other element is descended into so deeper Placemarks/geometries are found.
 */
function collectKmlGroups(
	element: Element,
	kinds: readonly ImportGeometryKind[],
	out: ImportGroup[],
): void {
	for (const child of Array.from(element.children)) {
		if (child.tagName === 'Placemark') {
			const name = kmlPlacemarkName(child);
			out.push(importGroup(name, combineKmlParts(kmlGeometriesWithin(child)), kinds));
		} else if (isKmlGeometryTag(child.tagName)) {
			const geometry = kmlGeometryFromNode(child);
			out.push(importGroup(null, geometry ?? 'unsupported', kinds));
		} else {
			collectKmlGroups(child, kinds, out);
		}
	}
}

/**
 * A Placemark's geometry elements as the one shape it holds.
 *
 * A `<MultiGeometry>` of three polygons is one shape in three pieces, exactly as
 * a GeoJSON MultiPolygon is. One mixing an area and a line is refused: there is
 * no shape both belong to, and picking one of them is the silent drop.
 */
function combineKmlParts(parts: readonly ImportBaseGeometry[]): ImportGeometry | ImportRefusal {
	const first = parts[0];
	if (first === undefined) {
		return 'unsupported';
	}
	if (parts.some((part) => part.type !== first.type)) {
		return 'mixed';
	}
	switch (first.type) {
		case 'Point':
			return pointFromParts(sameKind(parts, first).map((part) => part.coordinates));
		case 'Polygon':
			return polygonFromParts(sameKind(parts, first).map((part) => part.coordinates));
		default:
			return lineFromParts(sameKind(parts, first).map((part) => part.coordinates));
	}
}

/**
 * `parts` as the kind `first` is, which every one of them already is.
 *
 * The check above proved it; this is what tells the compiler, so each arm reads
 * its own `coordinates` shape rather than the union's.
 */
function sameKind<TPart extends ImportBaseGeometry>(
	parts: readonly ImportBaseGeometry[],
	first: TPart,
): TPart[] {
	return parts.filter((part): part is TPart => part.type === first.type);
}

function kmlPlacemarkName(placemark: Element): string | null {
	for (const child of Array.from(placemark.children)) {
		if (child.tagName === 'name') {
			const text = child.textContent?.trim() ?? '';
			return text.length === 0 ? null : text;
		}
	}
	return null;
}

/**
 * Collect every geometry descendant of an element (e.g. a Placemark's geometry),
 * in document order so a MultiGeometry's parts keep the file's ordering.
 */
function kmlGeometriesWithin(element: Element): ImportBaseGeometry[] {
	const geometries: ImportBaseGeometry[] = [];
	const walk = (node: Element): void => {
		for (const child of Array.from(node.children)) {
			if (isKmlGeometryTag(child.tagName)) {
				const geometry = kmlGeometryFromNode(child);
				if (geometry !== null) {
					geometries.push(geometry);
				}
				// A geometry never nests another; nothing below it to visit.
			} else {
				walk(child);
			}
		}
	};
	walk(element);
	return geometries;
}

/**
 * Turn one `<Point>`/`<Polygon>`/`<LineString>` element into a geometry, or null
 * if unusable.
 *
 * Whether the caller wants this kind is not asked here. A Placemark holding an
 * area and a line is refused as mixed however narrow the ask is, so both have to
 * be read before anything is gated. That is also why a `<Point>` a Google Earth
 * export drops into a `<MultiGeometry>` beside a polygon, to place the label,
 * now refuses the Placemark rather than being passed over: the file says the
 * feature holds two kinds of thing, and picking one of them is the silent drop
 * this parser stopped doing.
 */
function kmlGeometryFromNode(node: Element): ImportBaseGeometry | null {
	if (node.tagName === 'Polygon') {
		const outer = firstRingCoordinates(node, 'outerBoundaryIs');
		if (outer === null) {
			return null;
		}
		const rings: ImportPosition[][] = [outer];
		for (const inner of allRingCoordinates(node, 'innerBoundaryIs')) {
			rings.push(inner);
		}
		return { type: 'Polygon', coordinates: rings };
	}
	const positions = parseKmlCoordinates(coordinatesText(node));
	if (node.tagName === 'Point') {
		const first = positions[0];
		return first === undefined ? null : { type: 'Point', coordinates: first };
	}
	return positions.length < 2 ? null : { type: 'LineString', coordinates: positions };
}

/**
 * The text of the first `<coordinates>` under `element`, empty when it has none.
 *
 * An element with no coordinates and one holding whitespace say the same thing,
 * so the callers read the parsed positions rather than the element.
 */
function coordinatesText(element: Element): string {
	return Array.from(element.getElementsByTagName('coordinates'))[0]?.textContent ?? '';
}

function firstRingCoordinates(polygon: Element, boundaryTag: string): ImportPosition[] | null {
	const boundary = Array.from(polygon.getElementsByTagName(boundaryTag))[0];
	if (boundary === undefined) {
		return null;
	}
	const ring = closeRing(parseKmlCoordinates(coordinatesText(boundary)));
	return ring.length >= 4 ? ring : null;
}

function allRingCoordinates(polygon: Element, boundaryTag: string): ImportPosition[][] {
	const rings: ImportPosition[][] = [];
	for (const boundary of Array.from(polygon.getElementsByTagName(boundaryTag))) {
		const ring = closeRing(parseKmlCoordinates(coordinatesText(boundary)));
		if (ring.length >= 4) {
			rings.push(ring);
		}
	}
	return rings;
}

/**
 * Parse a KML `<coordinates>` blob — whitespace-separated `lon,lat[,alt]` tuples —
 * into `[lng, lat]` positions. Altitude is dropped.
 */
export function parseKmlCoordinates(text: string): ImportPosition[] {
	const positions: ImportPosition[] = [];
	for (const token of text.trim().split(/\s+/)) {
		if (token.length === 0) {
			continue;
		}
		const parts = token.split(',');
		const lng = Number.parseFloat(parts[0] ?? '');
		const lat = Number.parseFloat(parts[1] ?? '');
		if (Number.isFinite(lng) && Number.isFinite(lat)) {
			positions.push([lng, lat]);
		}
	}
	return positions;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
