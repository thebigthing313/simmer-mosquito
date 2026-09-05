import { describe, expect, it } from 'vitest';
import { dailyWorkRoster } from '../../../../hooks/queries/use-daily-work-roster';

/**
 * The two answers the Daily Work group needs, and the one it must not give.
 *
 * Reading no rows out of a cold collection looks exactly like reading them out
 * of an organization that has deactivated everybody, and the sidebar treats the
 * two the same way. Keeping them apart here is what stops a later change from
 * deciding the roster is empty and acting on it.
 */

const ADA = { id: 'p-ada', display_name: 'Ada Lovelace', is_active: true };
const BEN = { id: 'p-ben', display_name: 'Ben Okri', is_active: true };
const ORA = { id: 'p-ora', display_name: 'Órla Ní Chuinn', is_active: true };
const RETIRED = { id: 'p-ret', display_name: 'Ada Retired', is_active: false };

describe('dailyWorkRoster', () => {
	it('says nothing at all until the shape has synced', () => {
		expect(dailyWorkRoster([ADA, BEN], false)).toEqual({ listed: null, routable: null });
	});

	it('says the organization is empty rather than unknown once it has', () => {
		expect(dailyWorkRoster([], true)).toEqual({ listed: [], routable: [] });
	});

	it('lists the active Profiles alphabetically', () => {
		expect(dailyWorkRoster([BEN, ADA], true).listed).toEqual([
			{ id: 'p-ada', name: 'Ada Lovelace' },
			{ id: 'p-ben', name: 'Ben Okri' },
		]);
	});

	it('leaves a deactivated Profile out of the list and in the resolvable set', () => {
		const roster = dailyWorkRoster([ADA, RETIRED], true);

		expect(roster.listed?.map((person) => person.id)).toEqual(['p-ada']);
		// Still routable, so somebody already reading that person's day keeps a
		// breadcrumb with their name in it.
		expect(roster.routable?.map((person) => person.id)).toEqual(['p-ada', 'p-ret']);
	});

	it('sorts an accented name where a reader looks for it', () => {
		// `localeCompare`, not the query pipeline's `orderBy`, which puts Órla
		// after every unaccented name in the list.
		expect(dailyWorkRoster([BEN, ORA, ADA], true).listed?.map((person) => person.name)).toEqual([
			'Ada Lovelace',
			'Ben Okri',
			'Órla Ní Chuinn',
		]);
	});
});
