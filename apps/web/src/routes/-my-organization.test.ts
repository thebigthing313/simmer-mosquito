import { describe, expect, it } from 'vitest';
import {
	activeOrganizationSectionForPath,
	selectOptionsForValue,
	unitDefaultFields,
} from './-my-organization';

describe('organization route tabs', () => {
	it('selects the specific subroute tab instead of the general prefix', () => {
		expect(activeOrganizationSectionForPath('/my-organization/people', 'general')).toBe('people');
		expect(activeOrganizationSectionForPath('/my-organization/adult-surveillance', 'general')).toBe(
			'adult',
		);
		expect(activeOrganizationSectionForPath('/my-organization/control-methods', 'general')).toBe(
			'control',
		);
		expect(activeOrganizationSectionForPath('/my-organization/insecticides', 'general')).toBe(
			'insecticides',
		);
	});

	it('keeps general active for the organization index route', () => {
		expect(activeOrganizationSectionForPath('/my-organization', 'people')).toBe('general');
		expect(activeOrganizationSectionForPath('/my-organization/', 'people')).toBe('general');
	});
});

describe('organization select options', () => {
	it('does not render the empty select value as an option', () => {
		const options = [{ label: 'NY', value: 'NY' }];

		expect(selectOptionsForValue('', options)).toBe(options);
	});

	it('preserves unknown non-empty current values', () => {
		const options = [{ label: 'NY', value: 'NY' }];

		expect(selectOptionsForValue('PR', options)).toEqual([
			{ label: 'PR', value: 'PR' },
			{ label: 'NY', value: 'NY' },
		]);
	});
});

describe('unit default fields', () => {
	it('builds choices from units with the matching unit type', () => {
		const fields = unitDefaultFields(
			{
				weight: 'pound',
				distance: 'mile',
				area: 'acre',
				volume: 'gallon',
				temperature: 'fahrenheit',
				duration: 'hour',
				count: 'count',
				speed: 'miles_per_hour',
			},
			[
				unit({ code: 'kilogram', unitName: 'Kilogram', abbreviation: 'kg', unitType: 'weight' }),
				unit({ code: 'pound', unitName: 'Pound', abbreviation: 'lb', unitType: 'weight' }),
				unit({ code: 'meter', unitName: 'Meter', abbreviation: 'm', unitType: 'distance' }),
				unit({ code: 'mile', unitName: 'Mile', abbreviation: 'mi', unitType: 'distance' }),
			],
		);

		expect(fields.find((field) => field.label === 'Weight')?.options).toEqual([
			{ label: 'Pound (lb)', value: 'pound' },
			{ label: 'Kilogram (kg)', value: 'kilogram' },
		]);
		expect(fields.find((field) => field.label === 'Distance')?.options).toEqual([
			{ label: 'Mile (mi)', value: 'mile' },
			{ label: 'Meter (m)', value: 'meter' },
		]);
	});

	it('keeps the current unit code available when units have not synced it yet', () => {
		const fields = unitDefaultFields(
			{
				weight: 'stone',
				distance: 'mile',
				area: 'acre',
				volume: 'gallon',
				temperature: 'fahrenheit',
				duration: 'hour',
				count: 'count',
				speed: 'miles_per_hour',
			},
			[unit({ code: 'pound', unitName: 'Pound', abbreviation: 'lb', unitType: 'weight' })],
		);

		expect(fields.find((field) => field.label === 'Weight')?.options).toEqual([
			{ label: 'stone', value: 'stone' },
			{ label: 'Pound (lb)', value: 'pound' },
		]);
	});
});

function unit(overrides: {
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType:
		| 'weight'
		| 'distance'
		| 'area'
		| 'volume'
		| 'temperature'
		| 'duration'
		| 'count'
		| 'speed';
}) {
	return {
		id: overrides.code,
		code: overrides.code,
		unitName: overrides.unitName,
		abbreviation: overrides.abbreviation,
		unitType: overrides.unitType,
		unitSystem: overrides.unitType === 'weight' ? 'si' : 'us_customary',
		createdAt: '2026-01-01T00:00:00.000Z',
	} as const;
}
