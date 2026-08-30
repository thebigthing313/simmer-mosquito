/**
 * Which commands a trap edit is, and which of them carries which question.
 *
 * A trap's form saves three different things at once: what the trap is called,
 * how it is set and where it stands, and whether it is in service. Each is its
 * own command, and two of them can be refused. Renaming one relabels every
 * collection ever taken at it; bringing a retired one back can walk into a code
 * another trap took while it was out. Neither question belongs to the other
 * command, and getting that wrong is silent: the flag arrives on a command with
 * no reader for it, the guard never fires, and the write succeeds.
 */

import { describe, expect, it } from 'vitest';
import {
	type TrapFields,
	type TrapPoint,
	trapUpdatePlan,
} from '../../../../hooks/mutations/use-trap-mutations';

const CURRENT: TrapFields = {
	trapName: 'North Levee',
	trapCode: 'NL-1',
	description: null,
	collectionMethodId: '55555555-5555-4555-8555-555555555555',
	collectionLureId: null,
	addressId: null,
	isActive: true,
};

const REDRAWN: TrapPoint = {
	geometry: { type: 'Point', coordinates: [-121.49, 38.58] },
	centroid: { lat: 38.58, lng: -121.49, geomType: 'ST_Point' },
};

function plan(fields: Partial<TrapFields>, point: TrapPoint | null = null) {
	return trapUpdatePlan({
		fields: { ...CURRENT, ...fields },
		current: CURRENT,
		point,
		acknowledgements: {},
	});
}

describe('trap update plan', () => {
	it('is nothing at all when nothing moved', () => {
		// The domain refuses a command with nothing to change, so an untouched save
		// has to send no command rather than an empty one.
		expect(plan({})).toBeNull();
	});

	it('asks about the history when the name moves', () => {
		const result = plan({ trapName: 'North Levee 1' });

		expect(result?.intents).toEqual(['adultSurveillance.updateTrapDetails']);
		expect(result?.acknowledgements).toEqual({ acknowledgedHistoricalLabelChange: false });
	});

	it('asks about the history when the code moves', () => {
		expect(plan({ trapCode: 'NL-2' })?.acknowledgements).toEqual({
			acknowledgedHistoricalLabelChange: false,
		});
	});

	it('asks nothing on a description-only edit', () => {
		// Nothing reads a trap's description back, so there is no history to
		// relabel and no question to put.
		const result = plan({ description: 'Behind the pump house' });

		expect(result?.intents).toEqual(['adultSurveillance.updateTrapDetails']);
		expect(result?.acknowledgements).toEqual({});
	});

	it('names the configuration command for a redrawn point, and carries the centroid', () => {
		const result = plan({}, REDRAWN);

		expect(result?.intents).toEqual(['adultSurveillance.updateTrapConfiguration']);
		expect(result?.changes).toMatchObject({ lat: 38.58, lng: -121.49, geom_type: 'ST_Point' });
		expect(result?.acknowledgements).toEqual({});
	});

	it('asks about a duplicate code when a retired trap comes back', () => {
		// Retiring frees the code, so this is the one direction a collision can be
		// waiting.
		const retired: TrapFields = { ...CURRENT, isActive: false };
		const result = trapUpdatePlan({
			fields: CURRENT,
			current: retired,
			point: null,
			acknowledgements: {},
		});

		expect(result?.intents).toEqual(['adultSurveillance.reactivateTrap']);
		expect(result?.acknowledgements).toEqual({ acknowledgedDuplicateTrapCode: false });
	});

	it('asks nothing when a trap is retired', () => {
		const result = plan({ isActive: false });

		expect(result?.intents).toEqual(['adultSurveillance.retireTrap']);
		expect(result?.acknowledgements).toEqual({});
	});

	it('carries both questions when a rename and a reactivation land together', () => {
		const retired: TrapFields = { ...CURRENT, isActive: false };
		const result = trapUpdatePlan({
			fields: { ...CURRENT, trapName: 'North Levee 1' },
			current: retired,
			point: null,
			acknowledgements: {},
		});

		expect(result?.intents).toEqual([
			'adultSurveillance.updateTrapDetails',
			'adultSurveillance.reactivateTrap',
		]);
		expect(result?.acknowledgements).toEqual({
			acknowledgedHistoricalLabelChange: false,
			acknowledgedDuplicateTrapCode: false,
		});
	});

	it('passes an answer through rather than deciding it', () => {
		const result = trapUpdatePlan({
			fields: { ...CURRENT, trapName: 'North Levee 1' },
			current: CURRENT,
			point: null,
			acknowledgements: { acknowledgedHistoricalLabelChange: true },
		});

		expect(result?.acknowledgements).toEqual({ acknowledgedHistoricalLabelChange: true });
	});
});
