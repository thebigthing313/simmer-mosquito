import { describe, expect, it } from 'vitest';
import { drawLayers, EDGE_LAYERS, VERTEX_LAYER } from '../../../../components/map/draw-layers';

/*
 * The draw source's layer ids, pinned as written (#1543).
 *
 * The pointer hit-test asks Mapbox for features by layer id, and a layer it asks
 * for that the map never drew answers an empty list, so a click on a vertex or an
 * edge does nothing and nothing says why. These cases hold the ids the map draws
 * and the ids the hit-test asks for to one list.
 */
describe('drawLayers', () => {
	it('draws the five layers under the same ids, in the same order', () => {
		expect(drawLayers().map(({ id }) => id)).toEqual([
			'habitat-draw-fill',
			'habitat-draw-outline',
			'habitat-draw-line',
			'habitat-draw-vertex',
			'habitat-draw-point',
		]);
	});

	it('hit-tests vertices on the layer it draws them on', () => {
		const vertex = drawLayers().find(({ id }) => id === VERTEX_LAYER);
		expect(vertex?.type).toBe('circle');
	});

	it('hit-tests edges on the area outline, then the line', () => {
		const [outline, line] = EDGE_LAYERS;
		const ids = drawLayers().map(({ id }) => id);
		expect(EDGE_LAYERS).toHaveLength(2);
		expect(ids.indexOf(outline)).toBe(1);
		expect(ids.indexOf(line)).toBe(2);
	});
});
