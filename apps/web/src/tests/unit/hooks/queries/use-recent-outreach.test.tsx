/** @vitest-environment jsdom */

/**
 * Public engagement's read: outreach since a date, newest first.
 *
 * Two `left` joins, and each reference guarded on the action's own column rather
 * than on the joined row. That is the difference between "no technician was
 * recorded" and "the technician's row has not arrived", which an unmatched join
 * cannot tell apart on its own: it yields `undefined` for every field of the
 * missing side.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useRecentOutreachActions } from '../../../../hooks/queries/use-recent-outreach';
import { outreach_actions } from '../../../../lib/collections/outreach_actions';
import { outreach_methods } from '../../../../lib/collections/outreach_methods';
import { profiles } from '../../../../lib/collections/profiles';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const SINCE = '2026-08-01';

function action(
	id: string,
	date: string,
	overrides: {
		readonly outreach_method_id?: string;
		readonly technician_profile_id?: string | null;
	} = {},
) {
	return {
		id,
		outreach_date: date,
		outreach_method_id: 'm1',
		technician_profile_id: 'p1',
		reach: 40,
		reach_description: null,
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(outreach_methods, [{ id: 'm1', name: 'School visit' }]);
	seedRows(profiles, [{ id: 'p1', display_name: 'Rivera' }]);
});

describe('useRecentOutreachActions', () => {
	it('names the method and the technician through the joins', async () => {
		seedRows(outreach_actions, [action('a1', '2026-08-04')]);

		expect(
			(await renderRead(() => useRecentOutreachActions(SINCE))).result.current.actions,
		).toEqual([expect.objectContaining({ methodName: 'School visit', technicianName: 'Rivera' })]);
	});

	it('reads newest first', async () => {
		seedRows(outreach_actions, [
			action('a1', '2026-08-04'),
			action('a2', '2026-08-19'),
			action('a3', '2026-08-11'),
		]);

		const { result } = await renderRead(() => useRecentOutreachActions(SINCE));

		expect(result.current.actions.map((row) => row.id)).toEqual(['a2', 'a3', 'a1']);
	});

	it('leaves out anything before the date it was asked about', async () => {
		seedRows(outreach_actions, [action('a1', '2026-08-04'), action('a2', '2026-07-30')]);

		const { result } = await renderRead(() => useRecentOutreachActions(SINCE));

		expect(result.current.actions.map((row) => row.id)).toEqual(['a1']);
	});

	it('reads an unstaffed action as null rather than as a missing profile', async () => {
		// Guarded on `technician_profile_id`, so this is `null` and not the
		// `undefined` an unmatched join yields. A surface renders the two the same
		// way only by accident.
		seedRows(outreach_actions, [action('a1', '2026-08-04', { technician_profile_id: null })]);

		const { result } = await renderRead(() => useRecentOutreachActions(SINCE));

		expect(result.current.actions[0]?.technicianName).toBeNull();
	});

	it('keeps an action whose method was retired, under a stand-in name', async () => {
		seedRows(outreach_actions, [action('a1', '2026-08-04', { outreach_method_id: 'gone' })]);

		const { result } = await renderRead(() => useRecentOutreachActions(SINCE));

		expect(result.current.actions.map((row) => row.methodName)).toEqual(['Unknown method']);
	});
});
