import { describe, expect, it } from 'vitest';
import type {
	DomainCommandType,
	MultiRowCommandType,
	SingleRowCommandType,
} from '../../command-vocabulary.js';

/**
 * The vocabulary is a type, so what guards it is `tsc` rather than the runner —
 * these assertions fail the build, not the suite. They live in a test file
 * because that is where the workspace typechecks things it does not ship, and
 * because a domain added without being unioned in fails nothing otherwise.
 */
describe('domain command vocabulary', () => {
	it('admits a command name from every domain', () => {
		const names: readonly DomainCommandType[] = [
			'adultSurveillance.createTrap',
			'controlOperations.recordChemicalApplication',
			'fieldWork.addComment',
			'foundation.createGenus',
			'larvalSurveillance.createHabitat',
			'missionDispatch.createMission',
			'organizationSettings.updateTimezone',
			'publicEngagement.createContact',
			'weather.createWeatherStation',
		];

		expect(names).toHaveLength(9);
	});

	it('is a closed set of literals rather than a widened string', () => {
		// If any domain union were `string`, the whole vocabulary would be `string`
		// and every misspelling would typecheck — which is the failure this exists to
		// prevent, and the one that would otherwise go unnoticed.
		type IsExactlyString = string extends DomainCommandType ? true : false;
		const widened: IsExactlyString = false;

		expect(widened).toBe(false);
	});

	it('rejects a name no builder produces', () => {
		// @ts-expect-error — not a command in any domain's vocabulary.
		const invented: DomainCommandType = 'larvalSurveillance.disintegrateHabitat';

		expect(invented).toBeTypeOf('string');
	});
});

describe('multi-row commands', () => {
	it('names only commands that exist', () => {
		// Every entry was read off a server handler by hand, so a typo is the likely
		// failure — and a misspelled member would narrow nothing while looking as
		// though it had. This is what catches that.
		const everyMemberIsReal: DomainCommandType = null as unknown as MultiRowCommandType;

		expect(everyMemberIsReal).toBeNull();
	});

	/**
	 * None of `TNames` survived into the single-row vocabulary.
	 *
	 * Written as a conditional rather than as `const x: Extract<…>[] = []`, which
	 * is what this was first: an empty array satisfies any array type, so that
	 * version passed whether or not the names were excluded.
	 */
	type AllExcluded<TNames extends DomainCommandType> =
		Extract<TNames, SingleRowCommandType> extends never ? true : false;

	it('excludes each ordered-list move, not just the one that was noticed first', () => {
		// All three take an id list, so a move is N updates however positions are
		// numbered. The first sweep caught only moveAssignmentItems, which is the
		// failure this guards: a shape found once and not looked for again.
		const excluded: AllExcluded<
			| 'fieldWork.moveAssignmentItems'
			| 'fieldWork.moveRouteItems'
			| 'missionDispatch.moveMissionItems'
		> = true;

		expect(excluded).toBe(true);
	});

	it('excludes every merge, for the rows it names rather than its fan-out', () => {
		// Each takes `source*Ids`, so the caller named N rows and expects N to go.
		// The references the merge also repoints — habitats holding a merged
		// address_id, and so on — are not why: that half streams back like any
		// cascade and needs no optimistic write.
		const excluded: AllExcluded<
			| 'foundation.mergeAddresses'
			| 'larvalSurveillance.mergeHabitats'
			| 'publicEngagement.mergeContacts'
		> = true;

		expect(excluded).toBe(true);
	});

	it('excludes a create that carries its children, whatever the screen shows', () => {
		// A child names its parent, so the parent has to land first. That ordering is
		// the reason, not whether a given form lists the children while they are
		// created — applied as separate writes, the children reference a row the
		// server may still refuse.
		const excluded: AllExcluded<
			| 'missionDispatch.createMission'
			| 'controlOperations.recordChemicalApplication'
			| 'publicEngagement.createNotificationRegistration'
		> = true;

		expect(excluded).toBe(true);
	});

	it('excludes a write whose second row the user is looking at', () => {
		// Setting a trap collection from a stop writes the collection *and* closes the
		// assignment item that produced it. On a run page both are on screen, so one
		// optimistic row would show the stop still open after the user closed it.
		type StopWriteIsExcluded =
			'fieldWork.setTrapCollectionForAssignmentItem' extends SingleRowCommandType ? false : true;
		const excluded: StopWriteIsExcluded = true;

		expect(excluded).toBe(true);
	});

	it('keeps a cascading delete available, because the client still writes one row', () => {
		// Deleting a habitat also soft-deletes its comments and tags and detaches its
		// inspections. None of that is the client's to write: the comments were never
		// loaded, and the detached inspection updates when Electric says so. What the
		// user asked for is one row gone, which is what one mutation does.
		const cascadingDelete: SingleRowCommandType = 'larvalSurveillance.deleteHabitat';

		// Recording an inspection writes only `inspections` — its samples and species
		// counts arrive as their own commands — so it stays available too.
		const ordinary: SingleRowCommandType = 'larvalSurveillance.recordHabitatInspection';

		expect([cascadingDelete, ordinary]).toHaveLength(2);
	});
});
