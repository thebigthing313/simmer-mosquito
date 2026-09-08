import { describe, expect, it } from 'vitest';
import { missionDisplayName } from '../../../../hooks/queries/operations-view';
import { addStopDescription } from '../../../../routes/operations/-operations-display';

describe('addStopDescription', () => {
	const scheduledStartAt = new Date('2026-08-04T15:00:00Z');
	const timeZone = 'America/New_York';

	it('reads as one sentence for a mission with a name', () => {
		const name = missionDisplayName(
			{ missionName: 'Evening Fogging', controlType: 'application', scheduledStartAt },
			timeZone,
		);

		expect(addStopDescription(name)).toBe(
			'Draw where the crew has to go. This stop is for Evening Fogging.',
		);
	});

	it('does not double the preposition for a mission with no name', () => {
		// `missionDisplayName` answers "Source Reduction on Aug 4, 11:00" here, a
		// phrase that already carries "on". The description used to end on
		// "has to go on" and read it as a continuation of its own sentence (#676).
		const name = missionDisplayName(
			{ missionName: null, controlType: 'source_reduction', scheduledStartAt },
			timeZone,
		);

		const description = addStopDescription(name);

		expect(description).toBe(`Draw where the crew has to go. This stop is for ${name}.`);
		expect(description).toContain('This stop is for Source Reduction on ');
		expect(description).not.toContain('go on');
	});
});
