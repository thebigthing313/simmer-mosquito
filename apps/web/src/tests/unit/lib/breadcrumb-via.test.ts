import { describe, expect, it } from 'vitest';
import { breadcrumbPath, parseBreadcrumbVia } from '../../../lib/breadcrumb-via';

const ID = '11111111-1111-4111-8111-111111111111';
const LISTS = new Set(['/larval-surveillance/habitats', '/larval-surveillance/habitats/table']);
const isListPath = (path: string) => LISTS.has(path);

describe('breadcrumbPath', () => {
	it('re-roots a record opened from a sibling list under that list', () => {
		expect(breadcrumbPath(`/larval-surveillance/habitats/${ID}`, 'table', isListPath)).toBe(
			`/larval-surveillance/habitats/table/${ID}`,
		);
	});

	it('leaves the path alone with no origin', () => {
		const path = `/larval-surveillance/habitats/${ID}`;

		expect(breadcrumbPath(path, undefined, isListPath)).toBe(path);
	});

	it('leaves the path alone when the record has no such sibling list', () => {
		const path = `/gis/weather/${ID}`;

		expect(breadcrumbPath(path, 'table', isListPath)).toBe(path);
	});
});

describe('parseBreadcrumbVia', () => {
	it('keeps a list it knows and drops anything else', () => {
		expect(parseBreadcrumbVia('table')).toBe('table');
		expect(parseBreadcrumbVia('/public-engagement/service-requests/table')).toBeUndefined();
		expect(parseBreadcrumbVia(undefined)).toBeUndefined();
	});
});
