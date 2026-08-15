import { describe, expect, it } from 'vitest';
import type {
	DomainCommandType,
	MultiTableCommandType,
	SingleTableCommandType,
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

describe('multi-table commands', () => {
	it('names only commands that exist', () => {
		// Every entry was read off a server handler by hand, so a typo is the likely
		// failure — and a misspelled member would narrow nothing while looking as
		// though it had. This is what catches that.
		const everyMemberIsReal: DomainCommandType = null as unknown as MultiTableCommandType;

		expect(everyMemberIsReal).toBeNull();
	});

	it('excludes the cascading deletes from the single-table vocabulary', () => {
		// Deleting a habitat also writes comments, tag_items, route_items and
		// assignment_items, and detaches inspections — none of which a single
		// collection's optimistic mutation can represent.
		type HabitatDeleteIsExcluded = 'larvalSurveillance.deleteHabitat' extends SingleTableCommandType
			? false
			: true;
		const excluded: HabitatDeleteIsExcluded = true;

		expect(excluded).toBe(true);
	});

	it('keeps ordinary single-table writes available', () => {
		const allowed: SingleTableCommandType = 'larvalSurveillance.createHabitat';

		// Recording an inspection writes only `inspections` — its samples and species
		// counts arrive as their own commands — so it stays available too.
		const alsoAllowed: SingleTableCommandType = 'larvalSurveillance.recordHabitatInspection';

		expect([allowed, alsoAllowed]).toHaveLength(2);
	});
});
