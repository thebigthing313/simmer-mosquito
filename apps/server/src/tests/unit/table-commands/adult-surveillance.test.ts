/**
 * The three adult intent maps, as translations.
 *
 * Same purpose as `larval-surveillance.test.ts`: `dispatch.test.ts` covers the
 * mechanism with a fake spec, and what it cannot cover is the hand translation
 * from Postgres column names to domain arguments. `collections` is where that
 * matters most on this branch — six of its commands used to be chosen by reading
 * the body, and the worst of those readings turned a pending trap set into a
 * completed record because a `collectedAt` rode along.
 */

import { DomainValidationError } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { OrganizationCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import { collectionSpeciesTableCommands } from '../../../table-commands/collection-species.js';
import { collectionTableCommands } from '../../../table-commands/collections.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { trapTableCommands } from '../../../table-commands/traps.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const TRAP = '33333333-3333-4333-8333-333333333333';
const COLLECTION = '44444444-4444-4444-8444-444444444444';
const COLLECTION_SPECIES = '55555555-5555-4555-8555-555555555555';
const SPECIES = '66666666-6666-4666-8666-666666666666';
const METHOD = '77777777-7777-4777-8777-777777777777';
const LURE = '88888888-8888-4888-8888-888888888888';
const UNIT = '99999999-9999-4999-8999-999999999999';
const ASSIGNMENT_ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const SET_AT = '2026-08-10T06:00:00.000Z';
const EMPTIED_AT = '2026-08-11T06:00:00.000Z';

const traps = trapTableCommands(undefined as never);
const collections = collectionTableCommands(undefined as never);
const collectionSpecies = collectionSpeciesTableCommands(undefined as never);

function request(
	id: string,
	payload: Record<string, unknown>,
): IntentRequest<CommandTable, string> {
	return {
		payload,
		organization: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'manager',
		} as unknown as AuthContext,
		id,
	};
}

function build<TCommand extends WritableCommand>(
	spec: TableCommands<CommandTable, TCommand, unknown, string>,
	intent: OrganizationCommandType,
	intentRequest: IntentRequest<CommandTable, string>,
): TCommand {
	const builder = spec.intents[intent];
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(intentRequest);
}

describe('traps intent map', () => {
	it('reads a new trap off column names', () => {
		const command = build(
			traps,
			'adultSurveillance.createTrap',
			request(TRAP, {
				locationSource: { kind: 'geometry', geometry: { type: 'Point', coordinates: [-81, 28] } },
				collection_method_id: METHOD,
				collection_lure_id: LURE,
				trap_name: 'Canal Road CO2',
				trap_code: 'CR-14',
			}),
		);

		expect(command.payload).toMatchObject({
			trapId: TRAP,
			collectionMethodId: METHOD,
			collectionLureId: LURE,
			trapName: 'Canal Road CO2',
			trapCode: 'CR-14',
		});
	});

	it('retires and reactivates by name, not by the is_active value', () => {
		// The old PATCH read `isActive` for its direction. A body still carrying the
		// old value cannot now reverse the command it was sent with.
		const retired = build(
			traps,
			'adultSurveillance.retireTrap',
			request(TRAP, { is_active: true }),
		);
		const reactivated = build(
			traps,
			'adultSurveillance.reactivateTrap',
			request(TRAP, { is_active: false }),
		);

		expect([retired.type, reactivated.type]).toEqual([
			'adultSurveillance.retireTrap',
			'adultSurveillance.reactivateTrap',
		]);
	});

	it('lets a caller withhold the label-change acknowledgement the old route hard-coded', () => {
		const assumed = build(
			traps,
			'adultSurveillance.updateTrapDetails',
			request(TRAP, { trap_code: 'CR-15' }),
		);
		const withheld = build(
			traps,
			'adultSurveillance.updateTrapDetails',
			request(TRAP, { trap_code: 'CR-15', acknowledgedHistoricalLabelChange: false }),
		);

		expect(assumed.payload).toMatchObject({ acknowledgedHistoricalLabelChange: true });
		expect(withheld.payload).toMatchObject({ acknowledgedHistoricalLabelChange: false });
	});
});

describe('collections intent map', () => {
	it('sets a trap as pending even when the body carries a collected_at', () => {
		// The regression this whole layer exists for. The old create route computed
		// `isCollectedTiming(timing)` and a stray `collectedAt` silently produced a
		// completed record instead of the pending set the caller asked for.
		const command = build(
			collections,
			'adultSurveillance.setTrapCollection',
			request(COLLECTION, {
				trap_id: TRAP,
				started_at: SET_AT,
				collected_at: EMPTIED_AT,
				set_by_profile_id: ACTOR,
			}),
		);

		expect(command.type).toBe('adultSurveillance.setTrapCollection');
		expect(command.payload).toMatchObject({
			collectionId: COLLECTION,
			trapId: TRAP,
			timing: { mode: 'exact_timestamps', startedAt: new Date(SET_AT) },
		});
		expect((command.payload as { timing: object }).timing).not.toHaveProperty('collectedAt');
	});

	it('records a collected trap collection from the same columns', () => {
		const command = build(
			collections,
			'adultSurveillance.recordCollectedTrapCollection',
			request(COLLECTION, {
				trap_id: TRAP,
				started_at: SET_AT,
				collected_at: EMPTIED_AT,
				collected_by_profile_id: ACTOR,
				has_problem: true,
			}),
		);

		expect(command.payload).toMatchObject({
			trapId: TRAP,
			timing: {
				mode: 'exact_timestamps',
				startedAt: new Date(SET_AT),
				collectedAt: new Date(EMPTIED_AT),
			},
			collectedByProfileId: ACTOR,
			hasProblem: true,
		});
	});

	it('reads the collection-date timing mode off its own four columns', () => {
		// Agencies record duration one of two ways and the setting says which —
		// reading one agency's collections under the other's mode is silent.
		const command = build(
			collections,
			'adultSurveillance.recordCollectedTrapCollection',
			request(COLLECTION, {
				trap_id: TRAP,
				collection_timing_mode: 'collection_date_duration',
				collection_date: '2026-08-11',
				duration_amount: 24,
				duration_unit_id: UNIT,
			}),
		);

		expect(command.payload).toMatchObject({
			timing: {
				mode: 'collection_date_duration',
				collectionDate: '2026-08-11',
				durationAmount: 24,
				durationUnitId: UNIT,
			},
		});
	});

	it('names the stop in camelCase and the trap in its column', () => {
		// `collections` has two stop columns — one for the visit that set the trap
		// and one for the visit that emptied it — so a caller names the stop and the
		// command decides which column it lands in.
		const command = build(
			collections,
			'fieldWork.setTrapCollectionForAssignmentItem',
			request(COLLECTION, {
				assignmentItemId: ASSIGNMENT_ITEM,
				trap_id: TRAP,
				started_at: SET_AT,
			}),
		);

		expect(command.payload).toMatchObject({
			assignmentItemId: ASSIGNMENT_ITEM,
			collectionId: COLLECTION,
			trapId: TRAP,
		});
	});

	it('empties an existing collection from the collected_at column', () => {
		// `collectedAtTimestamp` is the domain's name for it and `collected_at` is
		// the column's — exactly the translation this layer is for.
		const command = build(
			collections,
			'adultSurveillance.collectCollection',
			request(COLLECTION, { collected_at: EMPTIED_AT, collected_by_profile_id: ACTOR }),
		);

		expect(command.payload).toMatchObject({
			collectedAt: new Date(EMPTIED_AT),
			collectedByProfileId: ACTOR,
		});
	});

	it('refuses a create keyed camelCase', () => {
		expect(() =>
			build(
				collections,
				'adultSurveillance.setTrapCollection',
				request(COLLECTION, { trapId: TRAP, startedAt: SET_AT }),
			),
		).toThrow(DomainValidationError);
	});

	it('corrects the timing columns as one group', () => {
		// A collection is either exactly timestamped or dated with a duration; half
		// of each is not a state the row can hold, so the six columns move together.
		const command = build(
			collections,
			'adultSurveillance.updateCollectionFieldDetails',
			request(COLLECTION, { collected_at: EMPTIED_AT, started_at: SET_AT }),
		);

		expect(command.payload).toMatchObject({
			changes: { timing: { mode: 'exact_timestamps', collectedAt: new Date(EMPTIED_AT) } },
		});
		expect((command.payload as { changes: object }).changes).not.toHaveProperty('hasProblem');
	});

	it('marks and clears a zero result by name', () => {
		const marked = build(
			collections,
			'adultSurveillance.markCollectionZeroResult',
			request(COLLECTION, { is_zero_result: false }),
		);
		const cleared = build(
			collections,
			'adultSurveillance.clearCollectionZeroResult',
			request(COLLECTION, { is_zero_result: true }),
		);

		expect([marked.type, cleared.type]).toEqual([
			'adultSurveillance.markCollectionZeroResult',
			'adultSurveillance.clearCollectionZeroResult',
		]);
	});

	it('serves cancel and delete as ordinary entries rather than extra routes', () => {
		const cancelled = build(
			collections,
			'adultSurveillance.cancelPendingCollection',
			request(COLLECTION, {}),
		);
		const deleted = build(
			collections,
			'adultSurveillance.deleteCollection',
			request(COLLECTION, { acknowledgedSpeciesCountDeletion: false }),
		);

		expect(cancelled.payload).toMatchObject({ collectionId: COLLECTION });
		expect(deleted.payload).toMatchObject({ acknowledgedSpeciesCountDeletion: false });
	});
});

describe('collection_species intent map', () => {
	it('reads a count with its sex and status off column names', () => {
		const command = build(
			collectionSpecies,
			'adultSurveillance.addCollectionSpeciesCount',
			request(COLLECTION_SPECIES, {
				collection_id: COLLECTION,
				species_id: SPECIES,
				count: 40,
				sex: 'female',
				status: 'bloodfed',
				identified_date: '2026-08-12',
			}),
		);

		expect(command.payload).toMatchObject({
			collectionId: COLLECTION,
			speciesId: SPECIES,
			count: 40,
			sex: 'female',
			status: 'bloodfed',
			identifiedDate: '2026-08-12',
		});
	});

	it('drops a sex or status the enum column cannot hold', () => {
		const command = build(
			collectionSpecies,
			'adultSurveillance.addCollectionSpeciesCount',
			request(COLLECTION_SPECIES, {
				collection_id: COLLECTION,
				species_id: SPECIES,
				count: 40,
				sex: 'unknown',
				identified_date: '2026-08-12',
			}),
		);

		expect(command.payload).toMatchObject({ sex: null, status: null });
	});
});
