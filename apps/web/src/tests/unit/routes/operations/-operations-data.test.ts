import { describe, expect, it } from 'vitest';
import {
	canProgressMissionItems,
	canRecordMissionStopWork,
} from '../../../../routes/operations/-operations-data';

/**
 * The two mission gates differ, and the difference is the whole of
 * `autoStartMission`.
 *
 * Sharing one gate is not a hypothetical mistake: the assignment side shipped
 * that way, and the record button sat disabled on every not-yet-started run
 * while the server was perfectly willing to accept the write and start the
 * mission with it.
 */
describe('mission stop gates', () => {
	it('works stops only while the mission is running', () => {
		expect(canProgressMissionItems('inProgress')).toBe(true);
		expect(canProgressMissionItems('scheduled')).toBe(false);
		expect(canProgressMissionItems('completed')).toBe(false);
		expect(canProgressMissionItems('cancelled')).toBe(false);
	});

	it('records against a scheduled mission, because recording starts it', () => {
		expect(canRecordMissionStopWork('scheduled')).toBe(true);
		expect(canRecordMissionStopWork('inProgress')).toBe(true);
	});

	it('still refuses a closed mission, as the server does', () => {
		expect(canRecordMissionStopWork('completed')).toBe(false);
		expect(canRecordMissionStopWork('cancelled')).toBe(false);
	});
});
