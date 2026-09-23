import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	canProgressMissionItems,
	canRecordMissionStopWork,
	formatOperationalDate,
	missionStopName,
} from '../../../../components/operations/operations-data';

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

/**
 * What a stop is called, in one order, because four surfaces used to be able to
 * disagree about it. The stored name is the operator's own word for the stop, so
 * it comes ahead of both joined names; `Loading…` is the one moment the rule
 * cannot tell a missing link from a stop nobody named.
 */
describe('missionStopName', () => {
	const request = { id: 'r1', summary: 'Standing water on Elm', controlType: 'source_reduction' };

	it('reads the stored name ahead of the request and the address', () => {
		expect(
			missionStopName({
				name: 'Third storm drain',
				request,
				addressLabel: '12 Elm St',
				isResolving: false,
			}),
		).toBe('Third storm drain');
	});

	it('falls back to the request, then the address, then the plain fact', () => {
		expect(
			missionStopName({ name: null, request, addressLabel: '12 Elm St', isResolving: false }),
		).toBe('Standing water on Elm');
		expect(
			missionStopName({ name: null, request: null, addressLabel: '12 Elm St', isResolving: false }),
		).toBe('12 Elm St');
		expect(
			missionStopName({ name: null, request: null, addressLabel: null, isResolving: false }),
		).toBe('Mapped stop');
	});

	it('says a linked row is still arriving rather than naming the stop early', () => {
		expect(
			missionStopName({ name: null, request: null, addressLabel: null, isResolving: true }),
		).toBe('Loading…');
		// A stored name needs nothing to arrive, so it draws through the wait.
		expect(
			missionStopName({ name: 'Back lot', request: null, addressLabel: null, isResolving: true }),
		).toBe('Back lot');
	});
});
