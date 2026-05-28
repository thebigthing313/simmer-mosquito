export type MapTilesetId =
	| 'habitats'
	| 'surveillance'
	| 'operations'
	| 'boundaries'
	| 'field-overview'
	| (string & {});

export type MapTileLayerId =
	| 'habitats'
	| 'habitat_points'
	| 'habitat_lines'
	| 'habitat_polygons'
	| 'habitat_clusters'
	| (string & {});

export interface TileCoordinate {
	readonly z: number;
	readonly x: number;
	readonly y: number;
}

export type MapTileFilterPrimitive = string | number | boolean;
export type MapTileFilterValue =
	| MapTileFilterPrimitive
	| readonly MapTileFilterPrimitive[]
	| null
	| undefined;
export type TileQueryFilters = Readonly<Record<string, MapTileFilterValue>>;

export interface MapTileSourceDefinition {
	readonly id: string;
	readonly tileset: MapTilesetId;
	readonly layers: readonly MapTileLayerId[];
	readonly urlTemplate: string;
	readonly filters?: TileQueryFilters;
	readonly minZoom?: number;
	readonly maxZoom?: number;
}

export function isMapTilesetId(value: unknown): value is MapTilesetId {
	return typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);
}

export function isTileCoordinate(value: unknown): value is TileCoordinate {
	if (!isRecord(value)) return false;
	if (
		!isNonNegativeInteger(value.z) ||
		!isNonNegativeInteger(value.x) ||
		!isNonNegativeInteger(value.y)
	) {
		return false;
	}

	const maxIndex = 2 ** value.z - 1;
	return value.x <= maxIndex && value.y <= maxIndex;
}

export function formatTileCoordinate(tile: TileCoordinate): string {
	return `${tile.z}/${tile.x}/${tile.y}`;
}

export function buildTileUrlTemplate(input: {
	readonly basePath?: string;
	readonly tileset: MapTilesetId;
	readonly filters?: TileQueryFilters;
}): string {
	const basePath = input.basePath ?? '/map/tiles';
	const queryString = buildTileQueryString(input.filters ?? {});
	const suffix = queryString.length > 0 ? `?${queryString}` : '';
	return `${trimTrailingSlash(basePath)}/${input.tileset}/{z}/{x}/{y}.mvt${suffix}`;
}

export function buildTileQueryString(filters: TileQueryFilters): string {
	const normalized = normalizeTileQueryFilters(filters);
	const params: string[] = [];

	for (const key of Object.keys(normalized).sort()) {
		const value = normalized[key];
		if (value == null) continue;
		params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
	}

	return params.join('&');
}

export function normalizeTileQueryFilters(
	filters: TileQueryFilters,
): Readonly<Record<string, string>> {
	const normalized: Record<string, string> = {};

	for (const [key, rawValue] of Object.entries(filters)) {
		if (!isSafeFilterKey(key)) continue;

		const value = normalizeFilterValue(rawValue);
		if (value == null || value.length === 0) continue;
		normalized[key] = value;
	}

	return normalized;
}

function normalizeFilterValue(value: MapTileFilterValue): string | null {
	if (value == null) return null;

	if (isFilterPrimitiveArray(value)) {
		const parts = value
			.map(formatFilterPrimitive)
			.filter((part) => part.length > 0)
			.sort();
		return parts.length > 0 ? parts.join(',') : null;
	}

	return formatFilterPrimitive(value);
}

function formatFilterPrimitive(value: MapTileFilterPrimitive): string {
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	return String(value).trim();
}

function isFilterPrimitiveArray(
	value: MapTileFilterValue,
): value is readonly MapTileFilterPrimitive[] {
	return Array.isArray(value);
}

function isSafeFilterKey(value: string): boolean {
	return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isInteger(value) && typeof value === 'number' && value >= 0;
}

function trimTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
