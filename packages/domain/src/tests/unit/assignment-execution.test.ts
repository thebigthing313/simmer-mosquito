import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../../adult-surveillance/index.js';
import {
	collectTrapCollectionForAssignmentItemCommand,
	recordCollectedTrapCollectionForAssignmentItemCommand,
	recordHabitatInspectionForAssignmentItemCommand,
	setTrapCollectionForAssignmentItemCommand,
} from '../../field-work/index.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const assignmentItemId = '33333333-3333-4333-8333-333333333333';
const inspectionId = '44444444-4444-4444-8444-444444444444';
const collectionId = '55555555-5555-4555-8555-555555555555';
const habitatId = '66666666-6666-4666-8666-666666666666';
const trapId = '77777777-7777-4777-8777-777777777777';
const durationUnitId = '88888888-8888-4888-8888-888888888888';

const ctx = { organizationId, actorProfileId };

/** A dry inspection — the shape with the fewest result rules attached. */
const dryResult = { isWet: false } as const;

describe('assignment execution commands', () => {
	describe('defaults', () => {
		it('closes the stop and starts the assignment unless told otherwise', () => {
			const command = recordHabitatInspectionForAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				inspectionId,
				inspectionDate: '2026-08-10',
				...dryResult,
			});

			expect(command.payload.completeAssignmentItem).toBe(true);
			expect(command.payload.autoStartAssignment).toBe(true);
		});

		it('takes an explicit false for either', () => {
			const command = recordHabitatInspectionForAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				inspectionId,
				inspectionDate: '2026-08-10',
				completeAssignmentItem: false,
				autoStartAssignment: false,
				...dryResult,
			});

			expect(command.payload.completeAssignmentItem).toBe(false);
			expect(command.payload.autoStartAssignment).toBe(false);
		});

		it('defaults both acknowledgements to false', () => {
			const command = setTrapCollectionForAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				collectionId,
				startedAt: new Date('2026-08-10T12:00:00Z'),
			});

			expect(command.payload.acknowledgedCompletedItemAdditionalRecord).toBe(false);
			expect(command.payload.acknowledgedTargetMismatch).toBe(false);
		});

		it('leaves the target null so the server can default it to the stop', () => {
			const command = recordHabitatInspectionForAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				inspectionId,
				inspectionDate: '2026-08-10',
				...dryResult,
			});

			expect(command.payload.habitatId).toBeNull();
		});

		it('keeps an explicit target when one is given', () => {
			const command = recordHabitatInspectionForAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				inspectionId,
				inspectionDate: '2026-08-10',
				habitatId,
				...dryResult,
			});

			expect(command.payload.habitatId).toBe(habitatId);
		});

		it('attributes the record to the actor when no performer is named', () => {
			const command = recordHabitatInspectionForAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				inspectionId,
				inspectionDate: '2026-08-10',
				...dryResult,
			});

			expect(command.payload.inspectedByProfileId).toBe(actorProfileId);
		});
	});

	describe('validation', () => {
		it('requires the stop', () => {
			expect(() =>
				recordHabitatInspectionForAssignmentItemCommand({
					...ctx,
					assignmentItemId: 'not-a-uuid',
					inspectionId,
					inspectionDate: '2026-08-10',
					...dryResult,
				}),
			).toThrow(DomainValidationError);
		});

		it('refuses a future completion timestamp', () => {
			expect(() =>
				recordHabitatInspectionForAssignmentItemCommand({
					...ctx,
					assignmentItemId,
					inspectionId,
					inspectionDate: '2026-08-10',
					completedAt: new Date(Date.now() + 60 * 60 * 1000),
					...dryResult,
				}),
			).toThrow(DomainValidationError);
		});

		it('applies the same inspection result rules as the larval command', () => {
			// A dry inspection carrying life-stage flags is contradictory, and the
			// rule lives in surveillance-records.ts rather than in either caller.
			expect(() =>
				recordHabitatInspectionForAssignmentItemCommand({
					...ctx,
					assignmentItemId,
					inspectionId,
					inspectionDate: '2026-08-10',
					isWet: false,
					hasPupae: true,
				}),
			).toThrow(DomainValidationError);
		});

		it('refuses a collection emptied before it was set', () => {
			expect(() =>
				recordCollectedTrapCollectionForAssignmentItemCommand({
					...ctx,
					assignmentItemId,
					collectionId,
					timing: {
						mode: 'exact_timestamps',
						startedAt: new Date('2026-08-10T12:00:00Z'),
						collectedAt: new Date('2026-08-09T12:00:00Z'),
					},
				}),
			).toThrow(DomainValidationError);
		});
	});

	describe('trap visits', () => {
		it('carries a pending timing when the trap is only set', () => {
			const startedAt = new Date('2026-08-10T12:00:00Z');
			const command = setTrapCollectionForAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				collectionId,
				trapId,
				startedAt,
			});

			expect(command.payload.timing).toEqual({ mode: 'exact_timestamps', startedAt });
			expect(command.payload.trapId).toBe(trapId);
		});

		it('accepts a date-and-duration collection', () => {
			const command = recordCollectedTrapCollectionForAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				collectionId,
				timing: {
					mode: 'collection_date_duration',
					collectionDate: '2026-08-10',
					durationAmount: 24,
					durationUnitId,
				},
			});

			expect(command.payload.timing).toEqual({
				mode: 'collection_date_duration',
				collectionDate: '2026-08-10',
				durationAmount: 24,
				durationUnitId,
			});
		});

		it('names the collection being emptied', () => {
			const collectedAtTimestamp = new Date('2026-08-10T12:00:00Z');
			const command = collectTrapCollectionForAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				collectionId,
				collectedAtTimestamp,
			});

			expect(command.payload.collectionId).toBe(collectionId);
			expect(command.payload.collectedAtTimestamp).toBe(collectedAtTimestamp);
			expect(command.payload.collectedByProfileId).toBe(actorProfileId);
			expect(command.payload.hasProblem).toBe(false);
		});
	});
});
