import { MAP_CLUSTER_UNTIL_ZOOM } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import type { MapTileLayer } from '../../../../components/map';
import { selectionOverlayLayer } from '../../../../components/map/geometry-tiles';
import {
	tileLayerBinding,
	tileLayerClusters,
	tileLayerFilterKey,
	tileLayerSelectionOverlay,
	tileLayerSpecs,
	tileLayerTileUrl,
} from '../../../../components/map/tile-layers';

// --- when the selection overlay draws ----------------------------------------
//
// A clustered tile can carry the selected trap only inside a cluster's count,
// so the map draws the record's own point from the row the page already holds.
// These cases are the rule for when it does, and for how the tile's own
// highlight steps aside so one record is never drawn selected twice.

const serverUrl = 'https://api.example.test';
/** The map's clustering setting, on and off. */
const ON = { cluster: true } as const;
const OFF = { cluster: false } as const;
const selectedId = 'b1c2d3e4-0000-4000-8000-000000000001';
const point = { type: 'Point', coordinates: [-74.45, 40.35] } as const;
const polygon = {
	type: 'Polygon',
	coordinates: [
		[
			[-74.5, 40.3],
			[-74.4, 40.3],
			[-74.4, 40.4],
			[-74.5, 40.3],
		],
	],
} as const;

type TrapLayer = Extract<MapTileLayer, { kind: 'traps' }>;

function traps(overrides: Partial<TrapLayer> = {}): MapTileLayer {
	return {
		kind: 'traps',
		serverUrl,
		selectedId,
		selectedRecord: { id: selectedId, geojson: point },
		...overrides,
	};
}

function selectedPointMinZoom(layer: MapTileLayer): number | undefined {
	return tileLayerSpecs(layer, ON).find((spec) => spec.id.endsWith('-selected-point'))?.minzoom;
}

describe('tileLayerClusters', () => {
	it('says which tilesets the server lets cluster', () => {
		expect(tileLayerClusters(traps())).toBe(true);
		expect(tileLayerClusters({ kind: 'habitats', serverUrl })).toBe(false);
	});
});

describe('the selection overlay', () => {
	it('draws the selected trap point over a clustered tileset', () => {
		const layer = traps();

		// The row's own object, so the overlay source is not reset every render.
		expect(tileLayerSelectionOverlay(layer, ON)).toBe(point);
		expect(selectedPointMinZoom(layer)).toBe(MAP_CLUSTER_UNTIL_ZOOM);
	});

	it('draws below the cut-off zoom only, where the tile highlight does not', () => {
		expect(selectionOverlayLayer('traps')).toMatchObject({
			id: 'traps-selection-point',
			type: 'circle',
			source: 'traps-selection',
			maxzoom: MAP_CLUSTER_UNTIL_ZOOM,
		});
		expect(selectionOverlayLayer('traps').minzoom).toBeUndefined();
	});

	it('paints exactly what the tile highlight paints', () => {
		const tileHighlight = tileLayerSpecs(traps(), ON).find(
			(spec) => spec.id === 'traps-selected-point',
		);

		expect(selectionOverlayLayer('traps').paint).toEqual(
			tileHighlight?.type === 'circle' ? tileHighlight.paint : undefined,
		);
	});

	it('draws nothing, and leaves the tile highlight alone, with nothing selected', () => {
		const layer = traps({ selectedId: null, selectedRecord: null });

		expect(tileLayerSelectionOverlay(layer, ON)).toBeNull();
		expect(selectedPointMinZoom(layer)).toBeUndefined();
	});

	it('waits for the selected row rather than hiding the tile highlight', () => {
		const layer = traps({ selectedRecord: null });

		expect(tileLayerSelectionOverlay(layer, ON)).toBeNull();
		expect(selectedPointMinZoom(layer)).toBeUndefined();
	});

	it('ignores a row that is not the selected record', () => {
		const layer = traps({ selectedRecord: { id: 'another-trap', geojson: point } });

		expect(tileLayerSelectionOverlay(layer, ON)).toBeNull();
	});

	it('leaves a shape the tiles never fold into a cluster to the tile highlight', () => {
		const multiPoint = { type: 'MultiPoint', coordinates: [[-74.45, 40.35]] };
		const holding = (geojson: unknown) => traps({ selectedRecord: { id: selectedId, geojson } });

		expect(tileLayerSelectionOverlay(holding(polygon), ON)).toBeNull();
		expect(tileLayerSelectionOverlay(holding(multiPoint), ON)).toBeNull();
		expect(tileLayerSelectionOverlay(holding(undefined), ON)).toBeNull();
		expect(selectedPointMinZoom(holding(polygon))).toBeUndefined();
	});

	it('draws nothing over a tileset whose tiles are not clustered', () => {
		const layer: MapTileLayer = {
			kind: 'habitats',
			serverUrl,
			selectedId,
			selectedRecord: { id: selectedId, geojson: point },
		};

		expect(tileLayerSelectionOverlay(layer, ON)).toBeNull();
		expect(selectedPointMinZoom(layer)).toBeUndefined();
		expect(tileLayerSpecs(layer, ON)).toEqual(tileLayerBinding(layer).buildLayers(layer));
	});

	it('never moves the tile URL, whatever is selected', () => {
		const url = (layer: MapTileLayer) => tileLayerTileUrl(layer, ON);

		expect(url(traps())).toBe(url(traps({ selectedId: null, selectedRecord: null })));
	});

	// The key is what re-runs the effect that re-scopes the tile layers, so the
	// highlight's zoom range has to move it, or the range would never reach GL.
	it('changes the re-scope key when the overlay starts drawing', () => {
		expect(tileLayerFilterKey(traps(), ON)).not.toBe(
			tileLayerFilterKey(traps({ selectedRecord: null }), ON),
		);
	});

	// The switch on the map turns clustering off for a tileset that takes it,
	// and then the tile draws every record as itself and its own highlight.
	it('draws nothing, and leaves the tile highlight alone, with clustering switched off', () => {
		expect(tileLayerSelectionOverlay(traps(), OFF)).toBeNull();
		expect(tileLayerSpecs(traps(), OFF)).toEqual(tileLayerBinding(traps()).buildLayers(traps()));
		expect(tileLayerTileUrl(traps(), OFF)).not.toContain('cluster=1');
	});
});
