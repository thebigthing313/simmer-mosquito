import { describe, expect, it } from 'vitest';
import {
	isRelevantTo,
	relevanceSummary,
	TAG_RELEVANCE_OPTIONS,
	tagPickerSections,
} from '../../../lib/tag-relevance';

/**
 * Which record types a Tag is suggested for, as the app reads the set.
 *
 * Every rule here is a decision the spec made rather than a shape the compiler
 * holds: an empty set means everywhere, an inactive Tag is never offered and
 * still shows where it is assigned, and the search reads the description as well
 * as the name. `docs/tag-relevance-spec.md` carries the reasons.
 */

function tag(overrides: Partial<PickerLike> = {}): PickerLike {
	return {
		id: overrides.id ?? 'tag_1',
		name: overrides.name ?? 'Priority',
		description: overrides.description ?? null,
		isActive: overrides.isActive ?? true,
		relevantEntityTypes: overrides.relevantEntityTypes ?? [],
	};
}

interface PickerLike {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly relevantEntityTypes: readonly string[];
}

const NONE: ReadonlySet<string> = new Set();

describe('a tag relevance set', () => {
	it('is relevant everywhere when it is empty', () => {
		// What every Tag in an Organization that has never touched the field has,
		// and what `createTag` writes. Reading it as "relevant to nothing" would
		// draw an empty suggested section on a catalog nobody has done anything
		// wrong to.
		expect(isRelevantTo([], 'habitat')).toBe(true);
		expect(isRelevantTo(['habitat'], 'habitat')).toBe(true);
		expect(isRelevantTo(['habitat'], 'trap')).toBe(false);
	});

	it('compares in the spelling the column holds', () => {
		// The column stores `service_request` and the app names the record type
		// `serviceRequest`. A comparison that skipped the conversion would match
		// nothing and put every Tag in the second section.
		expect(isRelevantTo(['service_request'], 'serviceRequest')).toBe(true);
	});

	it('reads its summary off the register, in register order', () => {
		expect(relevanceSummary([])).toBe('All records');
		expect(relevanceSummary(['service_request', 'address'])).toBe('Addresses, Service Requests');
		expect(TAG_RELEVANCE_OPTIONS.map((option) => option.value)).toEqual([
			'address',
			'region',
			'trap',
			'habitat',
			'contact',
			'service_request',
		]);
	});
});

describe('the tag picker sections', () => {
	it('puts a suggested tag first and everything else after', () => {
		const forHabitats = tag({ id: 'a', name: 'Needs access', relevantEntityTypes: ['habitat'] });
		const forTraps = tag({ id: 'b', name: 'Damaged', relevantEntityTypes: ['trap'] });
		const everywhere = tag({ id: 'c', name: 'Priority' });

		const sections = tagPickerSections([forHabitats, forTraps, everywhere], NONE, 'habitat', '');

		expect(sections.relevant.map((entry) => entry.id)).toEqual(['a', 'c']);
		expect(sections.rest.map((entry) => entry.id)).toEqual(['b']);
	});

	it('lists a deactivated tag only where it is assigned, and never as suggested', () => {
		// Inactive means "not available for new assignments", not hidden from
		// history. Sorting one by relevance would sort on a question that no longer
		// applies, so it draws in the second section whatever its set says.
		const retired = tag({ id: 'a', isActive: false, relevantEntityTypes: ['habitat'] });

		expect(tagPickerSections([retired], NONE, 'habitat', '')).toEqual({ relevant: [], rest: [] });
		expect(tagPickerSections([retired], new Set(['a']), 'habitat', '').rest).toEqual([retired]);
	});

	it('matches a substring of the name or of the description, ignoring case', () => {
		const named = tag({ id: 'a', name: 'Treated - culex' });
		const described = tag({ id: 'b', name: 'Priority', description: 'Culex breeding' });
		const neither = tag({ id: 'c', name: 'Roadside' });

		const sections = tagPickerSections([named, described, neither], NONE, 'habitat', 'CULEX');

		expect(sections.relevant.map((entry) => entry.id)).toEqual(['a', 'b']);
	});
});
