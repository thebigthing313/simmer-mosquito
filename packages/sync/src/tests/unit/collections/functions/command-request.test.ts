import { describe, expect, it } from 'vitest';
import {
	commandRequestFor,
	type PendingWrite,
} from '../../../../collections/functions/command-request.js';

interface TestRow {
	readonly id: string;
	readonly organization_id: string;
	readonly lat: number;
	readonly lng: number;
	readonly geom_type: string;
	readonly habitat_name: string | null;
	readonly is_active: boolean;
	readonly updated_at: Date;
	readonly updated_by_profile_id: string | null;
}

const row: TestRow = {
	id: 'habitat-1',
	organization_id: 'agency-1',
	lat: 41.2,
	lng: -95.9,
	geom_type: 'Point',
	habitat_name: 'Ditch by the levee',
	is_active: true,
	updated_at: new Date('2026-08-14T00:00:00.000Z'),
	updated_by_profile_id: 'profile-1',
};

/** A collection a client declared writable: all three handlers are attached. */
const writable = {
	id: 'habitats',
	config: { onInsert: () => {}, onUpdate: () => {}, onDelete: () => {} },
};

function write(overrides: Partial<PendingWrite<TestRow>>): PendingWrite<TestRow> {
	return {
		type: 'insert',
		modified: row,
		changes: {},
		key: 'habitat-1',
		metadata: { intents: ['larvalSurveillance.createHabitat'] },
		collection: writable,
		...overrides,
	};
}

const SERVER = 'https://api.test';

describe('commandRequestFor', () => {
	it('derives the route from the collection rather than being told it', () => {
		// This is what lets a transaction hold mutations from several collections
		// without carrying a map of endpoints alongside them.
		const request = commandRequestFor(write({ collection: { ...writable, id: 'traps' } }), SERVER);

		expect(request?.url).toBe('https://api.test/commands/traps');
	});

	it('sends a create as the row, without the columns the server owns', () => {
		const request = commandRequestFor(write({}), SERVER);

		expect(request?.method).toBe('POST');
		expect(request?.body).toEqual({
			id: 'habitat-1',
			habitat_name: 'Ditch by the levee',
			is_active: true,
			intents: ['larvalSurveillance.createHabitat'],
		});
	});

	it('sends an edit as only the fields that changed', () => {
		const request = commandRequestFor(
			write({
				type: 'update',
				changes: { habitat_name: 'Levee ditch', updated_at: new Date() },
				metadata: { intents: ['larvalSurveillance.updateHabitatDetails'] },
			}),
			SERVER,
		);

		expect(request?.method).toBe('PATCH');
		expect(request?.url).toBe('https://api.test/commands/habitats/habitat-1');
		expect(request?.body).toEqual({
			habitat_name: 'Levee ditch',
			intents: ['larvalSurveillance.updateHabitatDetails'],
		});
	});

	it('refuses to send an edit that changed nothing a client owns', () => {
		// An edit form stamps the audit columns on every save, so a record nobody
		// touched still produces a diff. Sending it would make the server refuse a
		// command for asking for nothing.
		const request = commandRequestFor(
			write({
				type: 'update',
				changes: { updated_at: new Date(), updated_by_profile_id: 'profile-2' },
				metadata: { intents: ['larvalSurveillance.updateHabitatDetails'] },
			}),
			SERVER,
		);

		expect(request).toBeNull();
	});

	it('treats a re-drawn shape as an edit even when no column moved', () => {
		const locationSource = { kind: 'geometry', geometry: { type: 'Point', coordinates: [1, 2] } };
		const request = commandRequestFor(
			write({
				type: 'update',
				changes: { updated_at: new Date() },
				metadata: { intents: ['larvalSurveillance.updateHabitatLocation'], locationSource },
			}),
			SERVER,
		);

		expect(request?.body).toEqual({
			locationSource,
			intents: ['larvalSurveillance.updateHabitatLocation'],
		});
	});

	it('sends a delete as the command it means and nothing else', () => {
		const request = commandRequestFor(
			write({ type: 'delete', metadata: { intents: ['larvalSurveillance.deleteHabitat'] } }),
			SERVER,
		);

		expect(request).toEqual({
			method: 'DELETE',
			url: 'https://api.test/commands/habitats/habitat-1',
			body: { intents: ['larvalSurveillance.deleteHabitat'] },
		});
	});

	it('sends every command a save meant, over one shared payload', () => {
		// Renaming a habitat and redrawing it is two commands against one row. They
		// cannot be two writes: TanStack DB merges two updates to a key and keeps only
		// the last `metadata`, so the rename would travel under the other command's
		// name and be dropped without an error.
		const locationSource = { kind: 'geometry', geometry: { type: 'Point', coordinates: [1, 2] } };
		const request = commandRequestFor(
			write({
				type: 'update',
				changes: { habitat_name: 'Levee ditch' },
				metadata: {
					intents: [
						'larvalSurveillance.updateHabitatDetails',
						'larvalSurveillance.updateHabitatLocation',
					],
					locationSource,
				},
			}),
			SERVER,
		);

		expect(request?.body).toEqual({
			habitat_name: 'Levee ditch',
			locationSource,
			intents: [
				'larvalSurveillance.updateHabitatDetails',
				'larvalSurveillance.updateHabitatLocation',
			],
		});
	});

	describe('what a record was worked against', () => {
		// The kinds are exclusive — a habitat or a collection, never both — and a
		// column diff cannot say so. The instruction says it once and the server
		// derives `habitat_id`/`inspection_id`/`collection_id` from it.
		const context = { kind: 'larval', habitatId: 'habitat-7' };

		it('sends it with a create', () => {
			const request = commandRequestFor(
				write({ metadata: { intents: ['controlOperations.recordSourceReduction'], context } }),
				SERVER,
			);

			expect(request?.body).toMatchObject({ context });
		});

		it('treats a re-attachment as an edit even when no column moved', () => {
			const request = commandRequestFor(
				write({
					type: 'update',
					changes: { updated_at: new Date() },
					metadata: {
						intents: ['controlOperations.updateSourceReductionLocationAndContext'],
						context,
					},
				}),
				SERVER,
			);

			expect(request?.body).toEqual({
				context,
				intents: ['controlOperations.updateSourceReductionLocationAndContext'],
			});
		});

		it('distinguishes detaching from leaving the attachment alone', () => {
			// `{ kind: 'none' }` clears it; absent says nothing about it at all. Sending
			// the first as the second would silently keep a link the user removed.
			const detach = commandRequestFor(
				write({
					type: 'update',
					changes: { habitat_name: 'x' },
					metadata: {
						intents: ['controlOperations.updateSourceReductionLocationAndContext'],
						context: { kind: 'none' },
					},
				}),
				SERVER,
			);
			const untouched = commandRequestFor(
				write({
					type: 'update',
					changes: { habitat_name: 'x' },
					metadata: { intents: ['controlOperations.updateSourceReductionFieldDetails'] },
				}),
				SERVER,
			);

			expect(detach?.body).toHaveProperty('context', { kind: 'none' });
			expect(untouched?.body).not.toHaveProperty('context');
		});

		it('never sends one on a delete', () => {
			const request = commandRequestFor(
				write({
					type: 'delete',
					metadata: { intents: ['controlOperations.deleteSourceReduction'], context },
				}),
				SERVER,
			);

			expect(request?.body).toEqual({ intents: ['controlOperations.deleteSourceReduction'] });
		});
	});

	describe('the refusals a write answers', () => {
		// The endpoints read these as flat top-level keys —
		// `payload.acknowledgedDuplicateTrapCode`, not `payload.acknowledgements.…`.
		// Callers group them under one metadata key so a retry can merge in a new
		// flag without rebuilding the write; the request is where that is undone.

		it('flattens them onto a create', () => {
			const request = commandRequestFor(
				write({
					metadata: {
						intents: ['controlOperations.recordSourceReduction'],
						acknowledgements: { acknowledgedMissionGeometryNotCovered: true },
					},
				}),
				SERVER,
			);

			expect(request?.body).toMatchObject({
				acknowledgedMissionGeometryNotCovered: true,
				intents: ['controlOperations.recordSourceReduction'],
			});
			expect(request?.body).not.toHaveProperty('acknowledgements');
		});

		it('flattens them onto an edit', () => {
			const request = commandRequestFor(
				write({
					type: 'update',
					changes: { habitat_name: 'Levee ditch' },
					metadata: {
						intents: ['larvalSurveillance.updateHabitatDetails'],
						acknowledgements: { acknowledgedTargetMismatch: true },
					},
				}),
				SERVER,
			);

			expect(request?.body).toEqual({
				habitat_name: 'Levee ditch',
				acknowledgedTargetMismatch: true,
				intents: ['larvalSurveillance.updateHabitatDetails'],
			});
		});

		it('carries them on a delete, which has nowhere else to put them', () => {
			// A cascade is the commonest question a write is refused over, and a delete
			// has no row and no changed fields for the answer to travel in.
			const request = commandRequestFor(
				write({
					type: 'delete',
					metadata: {
						intents: ['adultSurveillance.deleteTrap'],
						acknowledgements: { acknowledgedCascadeDelete: true },
					},
				}),
				SERVER,
			);

			expect(request?.body).toEqual({
				acknowledgedCascadeDelete: true,
				intents: ['adultSurveillance.deleteTrap'],
			});
		});

		it('does not make an empty patch into a request', () => {
			// Answering a refusal says this attempt may proceed, not that anything more
			// should change. A patch carrying nothing else is still asking the server to
			// write nothing.
			const request = commandRequestFor(
				write({
					type: 'update',
					changes: { updated_at: new Date() },
					metadata: {
						intents: ['larvalSurveillance.updateHabitatDetails'],
						acknowledgements: { acknowledgedTargetMismatch: true },
					},
				}),
				SERVER,
			);

			expect(request).toBeNull();
		});

		it('adds nothing when the write answers no refusal', () => {
			const request = commandRequestFor(
				write({ metadata: { intents: ['larvalSurveillance.createHabitat'] } }),
				SERVER,
			);

			expect(Object.keys(request?.body ?? {}).some((key) => key.startsWith('acknowledged'))).toBe(
				false,
			);
		});
	});

	it('refuses a write that does not say which commands it means', () => {
		for (const metadata of [{}, { intents: [] }, { intents: 'not-a-list' }, { intents: [''] }]) {
			expect(() => commandRequestFor(write({ metadata }), SERVER)).toThrowError(
				/must name the commands it means/,
			);
		}
	});

	describe('a collection the client declared read-only', () => {
		// `mutations: false` leaves the three handlers off. TanStack DB checks for
		// them and then skips the check inside a transaction, where the transaction's
		// own function persists the batch — so without this the declaration would
		// hold for a direct write and quietly lapse for a batched one.
		const readOnly = { id: 'species', config: {} };

		it('refuses each operation', () => {
			for (const type of ['insert', 'update', 'delete'] as const) {
				expect(() =>
					commandRequestFor(
						write({ type, collection: readOnly, changes: { habitat_name: 'x' } }),
						SERVER,
					),
				).toThrowError(/mutations disabled/);
			}
		});

		it('refuses per operation, so a partly writable collection still works', () => {
			// The handlers are three separate keys, so the check matches the mutation's
			// own type rather than one flag standing for all three.
			const appendOnly = { id: 'species', config: { onInsert: () => {} } };

			expect(commandRequestFor(write({ collection: appendOnly }), SERVER)).not.toBeNull();
			expect(() =>
				commandRequestFor(write({ type: 'delete', collection: appendOnly }), SERVER),
			).toThrowError(/cannot delete species/);
		});
	});
});
