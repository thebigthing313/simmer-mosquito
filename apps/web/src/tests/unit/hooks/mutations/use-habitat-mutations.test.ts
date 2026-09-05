/**
 * Which commands a habitat edit is, and which one a collector may not name.
 *
 * The three builders each ignore the others' fields, so the save has to name the
 * ones it means. Naming one it does not mean is worse here than the wasted write
 * it is elsewhere: `updateHabitatLocation` sits at the manager floor while
 * `updateHabitatDetails` sits at the collector floor, the server authorizes the
 * intent names before any builder runs, and #427 was a collector unable to fix a
 * description because the edit route recovered the redraw flag by comparing two
 * JSON serialisations that differed on key order.
 *
 * So `redraw: null` is the case that matters, and it means "the map was not
 * touched", never "clear the shape".
 */

import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import {
	type HabitatFields,
	type HabitatRedraw,
	habitatUpdatePlan,
} from '../../../../hooks/mutations/use-habitat-mutations';

const SHAPE: GeoJsonGeometry = { type: 'Point', coordinates: [-74.35, 40.55] };

const REDRAW: HabitatRedraw = {
	geometry: SHAPE,
	centroid: { lat: 40.55, lng: -74.35, geomType: 'st_point' },
};

function fields(overrides: Partial<HabitatFields> = {}): HabitatFields {
	return {
		habitatName: 'North basin catchment',
		description: 'Roadside catch basin behind the depot.',
		addressId: null,
		habitatTypeId: 'catch-basin',
		metadata: { access: 'gate code 4417' },
		...overrides,
	};
}

function plan(overrides: {
	readonly fields?: HabitatFields;
	readonly redraw?: HabitatRedraw | null;
}) {
	return habitatUpdatePlan({
		fields: overrides.fields ?? fields(),
		current: fields(),
		redraw: overrides.redraw ?? null,
	});
}

describe('habitatUpdatePlan', () => {
	it('names only the details command when the shape was not redrawn', () => {
		const result = plan({ fields: fields({ description: 'Basin is silted over.' }) });

		expect(result?.intents).toEqual(['larvalSurveillance.updateHabitatDetails']);
		expect(result?.locationSource).toBeUndefined();
	});

	it('keeps the location command out of a description edit a collector can save', () => {
		// The floor check reads intent names, so the absence of this one is the fix.
		const result = plan({ fields: fields({ description: 'Basin is silted over.' }) });

		expect(result?.intents).not.toContain('larvalSurveillance.updateHabitatLocation');
	});

	it('names the configuration command for the address and the type', () => {
		const result = plan({ fields: fields({ habitatTypeId: 'roadside-ditch' }) });

		expect(result?.intents).toEqual(['larvalSurveillance.updateHabitatConfiguration']);
		expect(result?.changes).toEqual({ address_id: null, habitat_type_id: 'roadside-ditch' });
	});

	it('reads the custom fields by value, so a rebuilt object is not an edit', () => {
		expect(plan({ fields: fields({ metadata: { access: 'gate code 4417' } }) })).toBeNull();
	});

	it('names the location command and carries the shape when the map was redrawn', () => {
		const result = plan({ redraw: REDRAW });

		expect(result?.intents).toEqual(['larvalSurveillance.updateHabitatLocation']);
		expect(result?.changes).toEqual({ lat: 40.55, lng: -74.35, geom_type: 'st_point' });
		expect(result?.locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
	});

	it('names every command a save means, in one write', () => {
		const result = plan({
			fields: fields({ description: 'Silted over.', addressId: 'address-1' }),
			redraw: REDRAW,
		});

		expect(result?.intents).toEqual([
			'larvalSurveillance.updateHabitatDetails',
			'larvalSurveillance.updateHabitatConfiguration',
			'larvalSurveillance.updateHabitatLocation',
		]);
	});

	it('is no write at all when nothing moved', () => {
		expect(plan({})).toBeNull();
	});
});
