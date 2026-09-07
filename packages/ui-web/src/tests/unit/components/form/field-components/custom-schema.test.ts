import { describe, expect, it } from 'vitest';
import {
	type CustomFieldDraft,
	customFieldDescriptors,
	customFieldEntries,
	customSchemaFromFields,
} from '../../../../../components/form/field-components/custom-schema';

const wingCondition = {
	wingCondition: { label: 'Wing condition', order: 0, type: 'text', required: true },
	dipCount: { label: 'Dip count', order: 1, type: 'integer', required: false },
};

function draftsOf(schema: unknown): CustomFieldDraft[] {
	return customFieldDescriptors(schema).map((descriptor) => ({ ...descriptor }));
}

describe('customFieldDescriptors', () => {
	it('reads the field map in declared order and keeps every key', () => {
		expect(customFieldDescriptors(wingCondition)).toEqual([
			{ key: 'wingCondition', label: 'Wing condition', required: true, valueType: 'text' },
			{ key: 'dipCount', label: 'Dip count', required: false, valueType: 'integer' },
		]);
	});

	it('sorts by the declared order rather than by write order', () => {
		const descriptors = customFieldDescriptors({
			second: { label: 'Second', order: 2 },
			first: { label: 'First', order: 1 },
		});

		expect(descriptors.map((descriptor) => descriptor.key)).toEqual(['first', 'second']);
	});

	it('reads a bare-map entry as the type it names', () => {
		expect(customFieldDescriptors({ count: 'number' })).toEqual([
			{ key: 'count', label: 'Count', required: false, valueType: 'number' },
		]);
	});

	it('reads a properties blob, its required list and its date format', () => {
		const descriptors = customFieldDescriptors({
			properties: {
				wing_condition: { type: 'string' },
				collectedOn: { type: 'string', format: 'date' },
			},
			required: ['collectedOn'],
		});

		expect(descriptors).toEqual([
			{ key: 'wing_condition', label: 'Wing condition', required: false, valueType: 'text' },
			{ key: 'collectedOn', label: 'Collected On', required: true, valueType: 'date' },
		]);
	});

	it('returns nothing for a schema that is not an object', () => {
		expect(customFieldDescriptors(null)).toEqual([]);
		expect(customFieldDescriptors(['wingCondition'])).toEqual([]);
	});
});

describe('customSchemaFromFields', () => {
	it('holds a key across a rename, so a stored value keeps rendering', () => {
		const drafts = draftsOf(wingCondition);
		const renamed = drafts.map((draft) =>
			draft.key === 'wingCondition' ? { ...draft, label: 'Wing state' } : draft,
		);

		const schema = customSchemaFromFields(renamed);

		expect(schema).toEqual({
			wingCondition: { label: 'Wing state', order: 0, type: 'text', required: true },
			dipCount: { label: 'Dip count', order: 1, type: 'integer', required: false },
		});
		expect(customFieldEntries(schema, { wingCondition: 'Torn' })[0]).toEqual({
			key: 'wingCondition',
			label: 'Wing state',
			required: true,
			valueType: 'text',
			declared: true,
			value: 'Torn',
		});
	});

	it('holds a key through every keystroke of a rename', () => {
		const [field] = draftsOf(wingCondition);
		if (field === undefined) {
			throw new Error('expected a first field');
		}

		for (const label of ['W', 'Wi', 'Win', 'Wing', 'Wing s', 'Wing state']) {
			expect(Object.keys(customSchemaFromFields([{ ...field, label }]) ?? {})).toEqual([
				'wingCondition',
			]);
		}
	});

	it('derives a key for a field that has none', () => {
		const schema = customSchemaFromFields([
			{ key: null, label: '  Wing condition  ', required: false, valueType: 'text' },
		]);

		expect(schema).toEqual({
			wingCondition: { label: 'Wing condition', order: 0, type: 'text', required: false },
		});
	});

	it('gives two labels that agree on a key distinct keys', () => {
		const schema = customSchemaFromFields([
			{ key: null, label: 'Wing condition', required: false, valueType: 'text' },
			{ key: null, label: 'wing-condition', required: false, valueType: 'text' },
		]);

		expect(Object.keys(schema ?? {})).toEqual(['wingCondition', 'wingCondition2']);
	});

	it('does not hand a new field a key an existing field is already using', () => {
		const schema = customSchemaFromFields([
			...draftsOf(wingCondition),
			{ key: null, label: 'Wing condition', required: false, valueType: 'text' },
		]);

		expect(Object.keys(schema ?? {})).toEqual(['wingCondition', 'dipCount', 'wingCondition2']);
	});

	it('renumbers order from list position', () => {
		const [first, second] = draftsOf(wingCondition);
		if (first === undefined || second === undefined) {
			throw new Error('expected two fields');
		}

		expect(customSchemaFromFields([second, first])).toEqual({
			dipCount: { label: 'Dip count', order: 0, type: 'integer', required: false },
			wingCondition: { label: 'Wing condition', order: 1, type: 'text', required: true },
		});
	});

	it('drops a field with a blank label and returns null when none is left', () => {
		expect(
			customSchemaFromFields([{ key: null, label: '   ', required: false, valueType: 'text' }]),
		).toBeNull();
		expect(customSchemaFromFields([])).toBeNull();
	});

	it('round trips the field map it writes', () => {
		const schema = customSchemaFromFields(draftsOf(wingCondition));

		expect(schema).toEqual(wingCondition);
		expect(customFieldDescriptors(schema)).toEqual(customFieldDescriptors(wingCondition));
	});

	it('round trips a properties blob into the field map, keeping its keys', () => {
		const blob = {
			properties: {
				wing_condition: { type: 'string' },
				dipCount: { type: 'integer' },
			},
			required: ['wing_condition'],
		};

		const schema = customSchemaFromFields(draftsOf(blob));

		expect(schema).toEqual({
			wing_condition: { label: 'Wing condition', order: 0, type: 'text', required: true },
			dipCount: { label: 'Dip Count', order: 1, type: 'integer', required: false },
		});
		expect(customFieldEntries(schema, { wing_condition: 'Torn' })[0]?.value).toBe('Torn');
	});
});
