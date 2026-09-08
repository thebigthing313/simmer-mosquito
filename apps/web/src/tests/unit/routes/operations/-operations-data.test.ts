import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	canProgressMissionItems,
	canRecordMissionStopWork,
	formatOperationalDate,
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

/**
 * A mission's rain date is a day, not an instant, so it is built in UTC and
 * rendered in UTC. The wording is asserted as well as the day, because the
 * formatter pins `en-US` since #683.
 */
describe('formatOperationalDate', () => {
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
	});

	it('renders the day that was planned, whatever zone the reader is in', () => {
		expect(formatOperationalDate('2026-08-04')).toBe('Aug 4, 2026');
	});

	it('hands back a date it cannot read, and says so', () => {
		expect(formatOperationalDate('the fourth')).toBe('the fourth');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatOperationalDate');
	});
});
