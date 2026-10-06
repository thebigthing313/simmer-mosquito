import { mapLifecycle } from '@simmer-mosquito/design-tokens';
import type { ExpressionSpecification } from 'mapbox-gl';
import { describe, expect, it } from 'vitest';
import { clusterBounds } from '../../../../components/map/cluster-fit';
import {
	allLayerIds,
	geometryTileLayers,
	interactiveLayerIds,
	TILE_CLUSTER_COLOR,
} from '../../../../components/map/geometry-tiles';
import { tileLayerBinding, tileLayerClusters } from '../../../../components/map/tile-layers';

// --- which layer draws which feature -----------------------------------------
//
// A clustered tile draws a cluster as a Point, so the only thing keeping a
// cluster off the record point layer, and off the selection highlight, is each
// layer's filter. The filters are evaluated here over the features a tile
// carries, with a reader for the handful of operators they use, so the cases
// say which layers draw a feature rather than what the expressions spell.

interface TileFeature {
	readonly type: 'Point' | 'LineString' | 'Polygon';
	readonly properties: Readonly<Record<string, unknown>>;
}

function evaluate(expression: unknown, feature: TileFeature): unknown {
	if (!Array.isArray(expression)) {
		return expression;
	}
	const [operator, ...args] = expression as [string, ...unknown[]];
	switch (operator) {
		case 'all':
			return args.every((arg) => evaluate(arg, feature) === true);
		case '==':
			return evaluate(args[0], feature) === evaluate(args[1], feature);
		case '!':
			return evaluate(args[0], feature) !== true;
		case 'has':
			return Object.hasOwn(feature.properties, String(args[0]));
		case 'get':
			return feature.properties[String(args[0])];
		case 'geometry-type':
			return feature.type;
		default:
			throw new Error(`No reader for the ${operator} operator.`);
	}
}

const sourceId = 'traps';
const palette = { fill: mapLifecycle.active, line: mapLifecycle.active };
const selectedId = 'b1c2d3e4-0000-4000-8000-000000000001';

function layersDrawing(feature: TileFeature, selected: string | null = selectedId): string[] {
	return geometryTileLayers(sourceId, palette, selected)
		.filter((layer) => evaluate(layer.filter as ExpressionSpecification, feature) === true)
		.map((layer) => layer.id);
}

const cluster: TileFeature = {
	type: 'Point',
	properties: {
		cluster: true,
		point_count: 4,
		cluster_west: -74.5,
		cluster_south: 40.3,
		cluster_east: -74.4,
		cluster_north: 40.4,
	},
};
const record: TileFeature = { type: 'Point', properties: { id: 'a-trap', isActive: true } };

describe('the shared record layer stack', () => {
	it('draws a cluster as a circle with its count and as nothing else', () => {
		expect(layersDrawing(cluster)).toEqual(['traps-clusters', 'traps-cluster-counts']);
	});

	it('draws a record point on the point layer alone', () => {
		expect(layersDrawing(record)).toEqual(['traps-points']);
	});

	it('highlights a selected record point and never a cluster', () => {
		expect(layersDrawing({ ...record, properties: { id: selectedId } })).toEqual([
			'traps-points',
			'traps-selected-point',
		]);
	});

	it('draws a polygon as it always did', () => {
		expect(layersDrawing({ type: 'Polygon', properties: { id: 'an-area' } })).toEqual([
			'traps-polygon-fill',
			'traps-polygon-outline',
		]);
	});

	it('lets a cluster be clicked first and owns both cluster layers for teardown', () => {
		expect(interactiveLayerIds(sourceId)[0]).toBe('traps-clusters');
		expect(allLayerIds(sourceId)).toEqual(
			expect.arrayContaining(['traps-clusters', 'traps-cluster-counts']),
		);
		// Every layer the stack builds is one the teardown removes.
		expect(geometryTileLayers(sourceId, palette, null).map((l) => l.id)).toEqual([
			...allLayerIds(sourceId),
		]);
	});
});

// Every tileset the map asks for clusters, through the table the map reads it
// from, so a tileset that clusters with a layer stack of its own is held to the
// same split as the shared one. A layer with no filter draws every feature.
const clusteringKinds = [
	'habitats',
	'addresses',
	'inspections',
	'samples',
	'chemical',
	'source-reduction',
	'biocontrol',
	'outreach',
	'traps',
	'collections',
	'service-requests',
] as const;

describe.each(clusteringKinds)('the %s layers', (kind) => {
	const layer = { kind, serverUrl: 'https://api.example.test', selectedId } as const;
	const binding = tileLayerBinding(layer);
	const drawing = (feature: TileFeature) =>
		binding
			.buildLayers(layer)
			.filter((spec) => {
				const filter = 'filter' in spec ? spec.filter : undefined;
				return filter === undefined || evaluate(filter, feature) === true;
			})
			.map((spec) => spec.id);

	it('says it clusters', () => {
		expect(tileLayerClusters(layer)).toBe(true);
	});

	it('draws a cluster as a circle with its count and as nothing else', () => {
		expect(drawing(cluster)).toEqual([`${kind}-clusters`, `${kind}-cluster-counts`]);
	});

	it('draws a lone record point and its highlight, and no cluster', () => {
		expect(drawing({ type: 'Point', properties: { id: 'a-record' } })).toEqual([`${kind}-points`]);
		expect(drawing({ type: 'Point', properties: { id: selectedId } })).toEqual([
			`${kind}-points`,
			`${kind}-selected-point`,
		]);
	});

	it('paints its clusters in the one cluster colour, whatever its palette', () => {
		const clusters = binding.buildLayers(layer).find((spec) => spec.id === `${kind}-clusters`);
		expect(clusters?.paint).toMatchObject({ 'circle-color': TILE_CLUSTER_COLOR });
	});

	it('lets a cluster be clicked first and tears both cluster layers down', () => {
		expect(binding.interactiveLayerIds[0]).toBe(`${kind}-clusters`);
		expect(binding.buildLayers(layer).map((spec) => spec.id)).toEqual([...binding.allLayerIds]);
	});
});

describe('clusterBounds', () => {
	it('reads the box a cluster carries', () => {
		expect(clusterBounds(cluster.properties)).toEqual({
			west: -74.5,
			south: 40.3,
			east: -74.4,
			north: 40.4,
		});
	});

	it('answers null for a record, and for a cluster missing an edge', () => {
		expect(clusterBounds(record.properties)).toBeNull();
		expect(clusterBounds(undefined)).toBeNull();
		expect(clusterBounds({ ...cluster.properties, cluster_north: undefined })).toBeNull();
	});
});
