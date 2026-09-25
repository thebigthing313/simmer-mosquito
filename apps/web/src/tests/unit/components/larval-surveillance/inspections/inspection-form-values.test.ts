/**
 * Conditions on a new inspection: no choice made until somebody makes one, and
 * no save until they have. An edit opens on the stored value, which the route
 * spreads over these defaults, so only the create half lives here.
 */

import { describe, expect, it } from 'vitest';
import {
	CONDITIONS_REQUIRED,
	defaultInspectionFormValues,
	inspectionResultOf,
	withConditionsChosen,
} from '../../../../../components/larval-surveillance/inspections/inspection-form-values';

describe('a new inspection', () => {
	it('opens with neither Wet nor Dry chosen', () => {
		expect(defaultInspectionFormValues('2026-09-24', 'profile-1').isWet).toBeNull();
	});

	it('refuses to save with no choice, on the Conditions field', () => {
		expect(withConditionsChosen({ isWet: null }, undefined)).toEqual({
			fields: { isWet: CONDITIONS_REQUIRED },
		});
	});

	it('keeps the other fields and the form message beside the Conditions one', () => {
		expect(
			withConditionsChosen(
				{ isWet: null },
				{ form: 'Unable to save.', fields: { dipCount: 'Dips must be at least 1.' } },
			),
		).toEqual({
			form: 'Unable to save.',
			fields: { dipCount: 'Dips must be at least 1.', isWet: CONDITIONS_REQUIRED },
		});
	});

	it('passes the builder its answer untouched once a choice is made', () => {
		const answer = { fields: { dipCount: 'Dips must be at least 1.' } };
		expect(withConditionsChosen({ isWet: false }, undefined)).toBeUndefined();
		expect(withConditionsChosen({ isWet: true }, answer)).toBe(answer);
	});

	it('writes a wet inspection with its life stages and a dry one without', () => {
		const values = {
			...defaultInspectionFormValues('2026-09-24', 'profile-1'),
			lifeStages: {
				hasEggs: false,
				hasFirstInstar: true,
				hasSecondInstar: false,
				hasThirdInstar: false,
				hasFourthInstar: false,
				hasPupae: true,
			},
		};
		expect(inspectionResultOf({ ...values, isWet: true })).toMatchObject({
			isWet: true,
			hasFirstInstar: true,
			hasPupae: true,
		});
		expect(inspectionResultOf({ ...values, isWet: false })).toMatchObject({
			isWet: false,
			hasFirstInstar: false,
			hasPupae: false,
		});
	});
});
