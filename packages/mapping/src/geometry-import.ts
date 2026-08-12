/**
 * Client-side parsing of geometry out of an uploaded KML, KMZ, or GeoJSON file.
 * Everything here is dependency-free: GeoJSON via `JSON.parse`, KML via the
 * browser's built-in `DOMParser`, and KMZ via `./kmz.js`.
 *
 * Callers say which geometry kinds they want (`Polygon`, `LineString`, or both);
 * every other geometry in the file is ignored and counted as skipped. Multi-part
 * geometries are flattened — a MultiPolygon becomes one candidate per polygon —
 * because the shapes this app stores are single-part.
 *
 * Two consumers share this: the bulk region import (`gis/regions/import`, which
 * turns every polygon in the file into a region) and the record forms' "fill
 * geometry from a file" convenience, which lets the user pick one shape.
 *
 * Reading a file (`readImportFileText`) is separate from parsing its text
 * (`collectImportGroups`) because only reading is asynchronous, and because the
 * pasted-GeoJSON path in `apps/admin` has text and no file. Only `parseKmlGroups`
 * touches the DOM; the GeoJSON path and the helpers are pure and unit-tested.
 */

import { extractKmlFromKmz, isZipArchive } from './kmz.js';

export type ImportPosition = [number, number];

export interface ImportPolygonGeometry {
	readonly type: 'Polygon';
	/** `[outer ring, ...holes]`, each closed (first position repeated last). */
	readonly coordinates: ImportPosition[][];
}

export interface ImportLineGeometry {
	readonly type: 'LineString';
	readonly coordinates: ImportPosition[];
}

export type ImportGeometry = ImportPolygonGeometry | ImportLineGeometry;

export type ImportGeometryKind = ImportGeometry['type'];

export const POLYGON_KINDS: readonly ImportGeometryKind[] = ['Polygon'];
export const LINE_KINDS: readonly ImportGeometryKind[] = ['LineString'];

/**
 * One source feature — a GeoJSON `Feature` or a KML `<Placemark>` — and the
 * geometries of the requested kinds it yielded. The grouping is what lets a
 * multi-part feature name its parts "North (1)", "North (2)".
 */
export interface ImportGroup {
	readonly name: string | null;
	readonly geometries: ImportGeometry[];
	/** True when the source carried geometry, but none of the requested kinds. */
	readonly skipped: boolean;
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
	/** Source geometries of an unwanted kind (points, lines under a polygon ask). */
	readonly skipped: number;
	/** True when the file held more than `limit` shapes and only the first were kept. */
	readonly truncated: boolean;
}

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
 * Flatten groups into named candidates, capped at `limit`. A group with several
 * geometries numbers its parts; an unnamed group falls back to `fallbackName N`.
 */
export function importCandidatesFrom(
	groups: readonly ImportGroup[],
	options: { readonly limit: number; readonly fallbackName: string },
): ImportCandidateResult {
	const candidates: ImportCandidate[] = [];
	let skipped = 0;
	let truncated = false;

	for (const group of groups) {
		if (group.geometries.length === 0) {
			if (group.skipped) {
				skipped += 1;
			}
			continue;
		}
		for (let index = 0; index < group.geometries.length; index += 1) {
			if (candidates.length >= options.limit) {
				// More shapes remain in the file; keep only the first `limit`.
				truncated = true;
				break;
			}
			const base = group.name ?? `${options.fallbackName} ${candidates.length + 1}`;
			const name = group.geometries.length > 1 ? `${base} (${index + 1})` : base;
			candidates.push({ name, geometry: group.geometries[index] as ImportGeometry });
		}
		if (truncated) {
			break;
		}
	}

	return { candidates, skipped, truncated };
}

/**
 * True when every position is a plausible WGS84 `[lng, lat]` pair.
 *
 * Agency exports are often in a projected CRS (State Plane feet, UTM metres),
 * whose coordinates parse as valid GeoJSON but land nowhere on earth — the
 * server's geometry validation rejects them, and the map would fly to nothing.
 * Catching it here lets a caller say so before the user fills out a whole form.
 */
export function isWgs84Geometry(geometry: ImportGeometry): boolean {
	const rings = geometry.type === 'Polygon' ? geometry.coordinates : [geometry.coordinates];
	return rings.every((ring) =>
		ring.every(([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90),
	);
}

/** Vertices a user would count: a polygon's closing position is not counted twice. */
export function importVertexCount(geometry: ImportGeometry): number {
	if (geometry.type === 'LineString') {
		return geometry.coordinates.length;
	}
	const ring = geometry.coordinates[0] ?? [];
	return Math.max(ring.length - 1, 0);
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
		const geometries = flattenGeometries(node.geometry, kinds);
		return [
			{ name: readGeoJsonName(node.properties), geometries, skipped: geometries.length === 0 },
		];
	}
	// A bare geometry object.
	const geometries = flattenGeometries(node, kinds);
	return [{ name: null, geometries, skipped: geometries.length === 0 }];
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
 * Flatten any GeoJSON geometry into the requested kinds. Multi-geometries split
 * into their members, GeometryCollections recurse, and everything else — points,
 * and whichever of line/polygon the caller did not ask for — yields nothing.
 */
export function flattenGeometries(
	geometry: unknown,
	kinds: readonly ImportGeometryKind[],
): ImportGeometry[] {
	if (!isRecord(geometry) || typeof geometry.type !== 'string') {
		return [];
	}
	const wantsPolygon = kinds.includes('Polygon');
	const wantsLine = kinds.includes('LineString');

	if (geometry.type === 'Polygon' && wantsPolygon) {
		const rings = normalizeRings(geometry.coordinates);
		return rings === null ? [] : [{ type: 'Polygon', coordinates: rings }];
	}
	if (geometry.type === 'MultiPolygon' && wantsPolygon) {
		if (!Array.isArray(geometry.coordinates)) {
			return [];
		}
		return geometry.coordinates
			.map((polygon) => normalizeRings(polygon))
			.filter((rings): rings is ImportPosition[][] => rings !== null)
			.map((rings) => ({ type: 'Polygon', coordinates: rings }));
	}
	if (geometry.type === 'LineString' && wantsLine) {
		const line = normalizeLine(geometry.coordinates);
		return line === null ? [] : [{ type: 'LineString', coordinates: line }];
	}
	if (geometry.type === 'MultiLineString' && wantsLine) {
		if (!Array.isArray(geometry.coordinates)) {
			return [];
		}
		return geometry.coordinates
			.map((line) => normalizeLine(line))
			.filter((line): line is ImportPosition[] => line !== null)
			.map((line) => ({ type: 'LineString', coordinates: line }));
	}
	if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
		return geometry.geometries.flatMap((child) => flattenGeometries(child, kinds));
	}
	return [];
}

/**
 * Coerce raw coordinate arrays into `[ring, ...holes]` of `[lng, lat]` pairs.
 * Rings are closed here, so a file that leaves the closing position off still
 * produces a polygon PostGIS accepts.
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
		const closed = closeRing(positions);
		// Three distinct corners plus the closing position is the smallest area.
		if (closed.length >= 4) {
			rings.push(closed);
		}
	}
	return rings.length === 0 ? null : rings;
}

/** Coerce a raw position array into `[lng, lat]` pairs; null if any is malformed. */
function normalizeLine(coordinates: unknown): ImportPosition[] | null {
	if (!Array.isArray(coordinates)) {
		return null;
	}
	const positions: ImportPosition[] = [];
	for (const point of coordinates) {
		if (
			!Array.isArray(point) ||
			typeof point[0] !== 'number' ||
			typeof point[1] !== 'number' ||
			!Number.isFinite(point[0]) ||
			!Number.isFinite(point[1])
		) {
			return null;
		}
		positions.push([point[0], point[1]]);
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

/** The KML element names this parser can turn into a geometry. */
const KML_GEOMETRY_TAGS = new Set(['Polygon', 'LineString']);

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
			const geometries = kmlGeometriesWithin(child, kinds);
			out.push({
				name: kmlPlacemarkName(child),
				geometries,
				skipped: geometries.length === 0,
			});
		} else if (KML_GEOMETRY_TAGS.has(child.tagName)) {
			const geometry = kmlGeometryFromNode(child, kinds);
			out.push({
				name: null,
				geometries: geometry === null ? [] : [geometry],
				skipped: geometry === null,
			});
		} else {
			collectKmlGroups(child, kinds, out);
		}
	}
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
function kmlGeometriesWithin(
	element: Element,
	kinds: readonly ImportGeometryKind[],
): ImportGeometry[] {
	const geometries: ImportGeometry[] = [];
	const walk = (node: Element): void => {
		for (const child of Array.from(node.children)) {
			if (KML_GEOMETRY_TAGS.has(child.tagName)) {
				const geometry = kmlGeometryFromNode(child, kinds);
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

/** Turn one `<Polygon>`/`<LineString>` element into a geometry, or null if unusable. */
function kmlGeometryFromNode(
	node: Element,
	kinds: readonly ImportGeometryKind[],
): ImportGeometry | null {
	if (node.tagName === 'Polygon') {
		if (!kinds.includes('Polygon')) {
			return null;
		}
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
	if (!kinds.includes('LineString')) {
		return null;
	}
	const coordinates = Array.from(node.getElementsByTagName('coordinates'))[0];
	if (coordinates === undefined) {
		return null;
	}
	const positions = parseKmlCoordinates(coordinates.textContent ?? '');
	return positions.length < 2 ? null : { type: 'LineString', coordinates: positions };
}

function firstRingCoordinates(polygon: Element, boundaryTag: string): ImportPosition[] | null {
	const boundary = Array.from(polygon.getElementsByTagName(boundaryTag))[0];
	if (boundary === undefined) {
		return null;
	}
	const coordinates = Array.from(boundary.getElementsByTagName('coordinates'))[0];
	if (coordinates === undefined) {
		return null;
	}
	const ring = closeRing(parseKmlCoordinates(coordinates.textContent ?? ''));
	return ring.length >= 4 ? ring : null;
}

function allRingCoordinates(polygon: Element, boundaryTag: string): ImportPosition[][] {
	const rings: ImportPosition[][] = [];
	for (const boundary of Array.from(polygon.getElementsByTagName(boundaryTag))) {
		const coordinates = Array.from(boundary.getElementsByTagName('coordinates'))[0];
		if (coordinates === undefined) {
			continue;
		}
		const ring = closeRing(parseKmlCoordinates(coordinates.textContent ?? ''));
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
