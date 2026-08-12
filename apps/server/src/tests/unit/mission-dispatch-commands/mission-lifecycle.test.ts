import { describe, expect, it } from 'vitest';
import {
	checkCancelMission,
	checkCompleteMission,
	checkMissionItemProgress,
	checkReopenMission,
	checkStartMission,
	type MissionSnapshot,
	readMissionItemState,
	readMissionState,
	rejectMission,
} from '../../../mission-dispatch-commands/mission-lifecycle.js';

const at = new Date('2026-08-05T12:00:00.000Z');

describe('readMissionState', () => {
	it('derives lifecycle from the timestamp columns', () => {
		expect(readMissionState({ started_at: null, completed_at: null, cancelled_at: null })).toBe(
			'scheduled',
		);
		expect(readMissionState({ started_at: at, completed_at: null, cancelled_at: null })).toBe(
			'in_progress',
		);
		expect(readMissionState({ started_at: at, completed_at: at, cancelled_at: null })).toBe(
			'completed',
		);
		expect(readMissionState({ started_at: at, completed_at: null, cancelled_at: at })).toBe(
			'cancelled',
		);
	});
});

describe('readMissionItemState', () => {
	it('reads progress from the item timestamps', () => {
		expect(readMissionItemState({ completed_at: null, skipped_at: null })).toBe('pending');
		expect(readMissionItemState({ completed_at: at, skipped_at: null })).toBe('completed');
		expect(readMissionItemState({ completed_at: null, skipped_at: at })).toBe('skipped');
	});
});

describe('checkStartMission', () => {
	it('starts a scheduled mission that has stops', () => {
		expect(checkStartMission(snapshot('scheduled', 3, 3))).toBeNull();
	});

	it('refuses a mission that is already running', () => {
		// Stricter than the assignment version on purpose: moving the start of a
		// running mission rewrites the window every progress timestamp on it was
		// judged against.
		expect(checkStartMission(snapshot('in_progress'))).toBe('mission_already_started');
	});

	it('refuses a terminal mission and one with nothing to do', () => {
		expect(checkStartMission(snapshot('completed'))).toBe('mission_not_startable');
		expect(checkStartMission(snapshot('cancelled'))).toBe('mission_not_startable');
		expect(checkStartMission(snapshot('scheduled', 0, 0))).toBe('mission_has_no_items');
	});
});

describe('checkCompleteMission', () => {
	it('completes a running mission whose stops are all handled', () => {
		expect(checkCompleteMission(snapshot('in_progress', 3, 0), { autoStart: false })).toBeNull();
	});

	it('completes a scheduled mission only when the command auto-starts it', () => {
		expect(checkCompleteMission(snapshot('scheduled', 3, 0), { autoStart: true })).toBeNull();
		expect(checkCompleteMission(snapshot('scheduled', 3, 0), { autoStart: false })).toBe(
			'mission_not_started',
		);
	});

	it('requires at least one active stop, all of them handled', () => {
		expect(checkCompleteMission(snapshot('in_progress', 0, 0), { autoStart: true })).toBe(
			'mission_has_no_items',
		);
		expect(checkCompleteMission(snapshot('in_progress', 3, 1), { autoStart: true })).toBe(
			'mission_items_pending',
		);
	});

	it('refuses an already terminal mission even with auto-start on', () => {
		expect(checkCompleteMission(snapshot('completed', 3, 0), { autoStart: true })).toBe(
			'mission_not_completable',
		);
		expect(checkCompleteMission(snapshot('cancelled', 3, 0), { autoStart: true })).toBe(
			'mission_not_completable',
		);
	});
});

describe('checkCancelMission', () => {
	it('cancels a scheduled or running mission', () => {
		expect(checkCancelMission(snapshot('scheduled'))).toBeNull();
		expect(checkCancelMission(snapshot('in_progress'))).toBeNull();
	});

	it('separates the no-op from the one with a way forward', () => {
		expect(checkCancelMission(snapshot('cancelled'))).toBe('mission_already_cancelled');
		expect(checkCancelMission(snapshot('completed'))).toBe('mission_not_cancellable');
	});
});

describe('checkReopenMission', () => {
	it('applies only to completed or cancelled missions', () => {
		expect(checkReopenMission(snapshot('completed'))).toBeNull();
		expect(checkReopenMission(snapshot('cancelled'))).toBeNull();
		expect(checkReopenMission(snapshot('scheduled'))).toBe('mission_not_reopenable');
		expect(checkReopenMission(snapshot('in_progress'))).toBe('mission_not_reopenable');
	});
});

describe('checkMissionItemProgress', () => {
	const running = { autoStart: false, timing: { progressAt: null, startedAt: at } };

	it('refuses progress on a terminal mission whatever the flags say', () => {
		expect(
			checkMissionItemProgress('complete', 'completed', 'pending', {
				autoStart: true,
				timing: { progressAt: null, startedAt: at },
			}),
		).toBe('mission_not_in_progress');
		expect(checkMissionItemProgress('complete', 'cancelled', 'pending', running)).toBe(
			'mission_not_in_progress',
		);
	});

	it('lets complete and skip start a scheduled mission, but not reopen or unskip', () => {
		const scheduled = { autoStart: true, timing: { progressAt: null, startedAt: null } };

		expect(checkMissionItemProgress('complete', 'scheduled', 'pending', scheduled)).toBeNull();
		expect(checkMissionItemProgress('skip', 'scheduled', 'pending', scheduled)).toBeNull();
		// Starting a mission in order to un-record something on it makes no sense.
		expect(checkMissionItemProgress('reopen', 'scheduled', 'completed', scheduled)).toBe(
			'mission_not_started',
		);
		expect(checkMissionItemProgress('unskip', 'scheduled', 'skipped', scheduled)).toBe(
			'mission_not_started',
		);
	});

	it('refuses a scheduled mission when the command declines to start it', () => {
		expect(
			checkMissionItemProgress('complete', 'scheduled', 'pending', {
				autoStart: false,
				timing: { progressAt: null, startedAt: null },
			}),
		).toBe('mission_not_started');
	});

	it('sends a stop through its undo rather than recording over an outcome', () => {
		expect(checkMissionItemProgress('complete', 'in_progress', 'skipped', running)).toBe(
			'mission_item_skipped',
		);
		expect(checkMissionItemProgress('skip', 'in_progress', 'completed', running)).toBe(
			'mission_item_completed',
		);
	});

	it('refuses re-recording the outcome a stop already has', () => {
		expect(checkMissionItemProgress('complete', 'in_progress', 'completed', running)).toBe(
			'mission_item_already_completed',
		);
		expect(checkMissionItemProgress('skip', 'in_progress', 'skipped', running)).toBe(
			'mission_item_already_skipped',
		);
	});

	it('lets an acknowledged second action through on an already-completed stop', () => {
		// Execution is not a repeated `complete`: a mission stop treated twice in a
		// day is real work whose stop happens to be closed, and the assignment side
		// has always taken the same answer (`checkExecution`). The flag is only ever
		// set by the execution path, so an ordinary Complete still refuses.
		expect(
			checkMissionItemProgress('complete', 'in_progress', 'completed', {
				...running,
				acknowledgedCompletedItemAdditionalAction: true,
			}),
		).toBeNull();
	});

	it('does not let the acknowledgement clear any other refusal', () => {
		// It answers one question. A skipped stop still has to be unskipped, and a
		// closed mission is still closed.
		const acknowledged = { ...running, acknowledgedCompletedItemAdditionalAction: true };
		expect(checkMissionItemProgress('complete', 'in_progress', 'skipped', acknowledged)).toBe(
			'mission_item_skipped',
		);
		expect(checkMissionItemProgress('skip', 'in_progress', 'skipped', acknowledged)).toBe(
			'mission_item_already_skipped',
		);
		expect(checkMissionItemProgress('complete', 'cancelled', 'completed', acknowledged)).toBe(
			'mission_not_in_progress',
		);
	});

	it('reopens only completed stops and unskips only skipped ones', () => {
		expect(checkMissionItemProgress('reopen', 'in_progress', 'completed', running)).toBeNull();
		expect(checkMissionItemProgress('reopen', 'in_progress', 'pending', running)).toBe(
			'mission_item_not_completed',
		);
		expect(checkMissionItemProgress('unskip', 'in_progress', 'skipped', running)).toBeNull();
		expect(checkMissionItemProgress('unskip', 'in_progress', 'completed', running)).toBe(
			'mission_item_not_skipped',
		);
	});

	it('refuses progress dated before a mission that was already running', () => {
		expect(
			checkMissionItemProgress('complete', 'in_progress', 'pending', {
				autoStart: true,
				timing: {
					progressAt: new Date('2026-08-05T07:00:00.000Z'),
					startedAt: new Date('2026-08-05T09:00:00.000Z'),
				},
			}),
		).toBe('mission_item_progress_before_start');
	});

	it('has no start to compare against on the auto-start path', () => {
		// "Once effective start is known" settled: the start this timestamp would be
		// measured against is the one this very command is about to stamp, so there
		// is nothing for it to be before. Without this, an auto-starting completion
		// backdated by a crew would refuse itself.
		expect(
			checkMissionItemProgress('complete', 'scheduled', 'pending', {
				autoStart: true,
				timing: { progressAt: new Date('2026-08-05T07:00:00.000Z'), startedAt: null },
			}),
		).toBeNull();
	});

	it('reports the state problem first when a stop has both', () => {
		// A skipped stop being completed with an impossible timestamp is told to
		// unskip first. Answering with the timing rule would send someone to check
		// the clock over a transition that was never going to be allowed.
		expect(
			checkMissionItemProgress('complete', 'in_progress', 'skipped', {
				autoStart: false,
				timing: {
					progressAt: new Date('2026-08-05T07:00:00.000Z'),
					startedAt: new Date('2026-08-05T09:00:00.000Z'),
				},
			}),
		).toBe('mission_item_skipped');
	});
});

function snapshot(
	state: MissionSnapshot['state'],
	activeItemCount = 1,
	pendingItemCount = 0,
): MissionSnapshot {
	return {
		state,
		startedAt: state === 'scheduled' ? null : at,
		activeItemCount,
		pendingItemCount,
	};
}

describe('rejectMission', () => {
	it('passes null through and throws a worded refusal otherwise', () => {
		expect(() => rejectMission(null)).not.toThrow();
		// Every rejection has to carry a sentence, or a refusal the crew could
		// have acted on reaches them as a bare error code.
		try {
			rejectMission('mission_item_wrong_control_type');
			expect.unreachable('should have thrown');
		} catch (error) {
			const body = (error as { readonly body: { readonly reason?: string } }).body;
			expect(body.reason).toBe('This mission is not for the kind of work you are recording.');
		}
	});

	it('words the two execution refusals it introduced', () => {
		for (const rejection of [
			'mission_item_requested_action_mismatch',
			'mission_geometry_not_covered',
		] as const) {
			try {
				rejectMission(rejection);
				expect.unreachable('should have thrown');
			} catch (error) {
				const body = (error as { readonly body: { readonly reason?: string } }).body;
				expect(body.reason).toBeTruthy();
			}
		}
	});
});
