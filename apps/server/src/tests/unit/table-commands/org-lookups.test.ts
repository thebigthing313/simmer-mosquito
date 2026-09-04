/**
 * The three org-scoped lookup catalogs, as translations.
 *
 * Three tables that used to be nine routes built from a table, with the
 * `build*UpdateCommands` trio underneath deciding what a PATCH meant from which
 * keys arrived. What is under test is that each catalog reaches its own command,
 * that the three sharing one factory did not become three maps building one
 * catalog's command, and that a catalog reads only the columns its table has —
 * the failure the factory's `columns` flag exists to prevent, and the one the
 * type system cannot catch because the domain builders take their input by
 * spread.
 */

import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { AgencyCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import {
	collectionLureTableCommands,
	collectionMethodTableCommands,
	habitatTypeTableCommands,
} from '../../../table-commands/org-lookups.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';

function request(payload: Record<string, unknown>): IntentRequest<CommandTable, string> {
	return {
		payload,
		agency: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'admin',
		} as unknown as AuthContext,
		id: ROW,
	};
}

function build<TCommand extends WritableCommand>(
	spec: TableCommands<CommandTable, TCommand, unknown, string>,
	intent: AgencyCommandType,
	intentRequest: IntentRequest<CommandTable, string>,
): TCommand {
	const builder = spec.intents[intent];
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(intentRequest);
}

const methods = collectionMethodTableCommands(undefined as never);
const lures = collectionLureTableCommands(undefined as never);
const habitatTypes = habitatTypeTableCommands(undefined as never);

const CATALOGS = [
	{
		table: 'collection_methods',
		spec: methods,
		create: 'foundation.createCollectionMethod',
		idKey: 'collectionMethodId',
	},
	{
		table: 'collection_lures',
		spec: lures,
		create: 'foundation.createCollectionLure',
		idKey: 'collectionLureId',
	},
	{
		table: 'habitat_types',
		spec: habitatTypes,
		create: 'foundation.createHabitatType',
		idKey: 'habitatTypeId',
	},
] as const;

describe('org lookup catalogs', () => {
	it('gives each catalog its own table and its own command', () => {
		// The factory's failure mode: three maps that all build one catalog's
		// command, which no per-catalog test would catch on its own.
		const built = CATALOGS.map((catalog) => ({
			table: catalog.spec.table,
			command: build(
				catalog.spec,
				catalog.create as AgencyCommandType,
				request({ name: 'Gravid trap' }),
			),
		}));

		expect(built.map((b) => b.table)).toEqual(CATALOGS.map((c) => c.table));
		expect(built.map((b) => b.command.type)).toEqual(CATALOGS.map((c) => c.create));
		// Each builder holds its own id argument's name.
		for (const [index, entry] of built.entries()) {
			expect(entry.command.payload).toHaveProperty(CATALOGS[index]?.idKey ?? '', ROW);
		}
	});

	it('reads a collection method off its column names', () => {
		const command = build(
			methods,
			'foundation.createCollectionMethod',
			request({
				name: 'CDC light trap',
				description: 'Overnight CO2-baited',
				custom_schema: { fields: [] },
				action_threshold: 25,
			}),
		);

		expect(command.payload).toMatchObject({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			collectionMethodId: ROW,
			name: 'CDC light trap',
			description: 'Overnight CO2-baited',
			customSchema: { fields: [] },
			actionThreshold: 25,
		});
	});

	it('tells an absent description from one sent as null', () => {
		// Absent means "not changing it"; present-and-null means "clear it". A
		// reader that tested truthiness could not say which was meant.
		const untouched = build(
			habitatTypes,
			'foundation.updateHabitatType',
			request({ name: 'Storm drain' }),
		);
		const cleared = build(
			habitatTypes,
			'foundation.updateHabitatType',
			request({ description: null }),
		);

		expect((untouched.payload as { changes: object }).changes).not.toHaveProperty('description');
		expect(cleared.payload).toMatchObject({ changes: { description: null } });
	});

	it('deactivates and reactivates by name, not by the is_active value', () => {
		const off = build(
			methods,
			'foundation.deactivateCollectionMethod',
			request({ is_active: true }),
		);
		const on = build(
			methods,
			'foundation.reactivateCollectionMethod',
			request({ is_active: false }),
		);

		expect([off.type, on.type]).toEqual([
			'foundation.deactivateCollectionMethod',
			'foundation.reactivateCollectionMethod',
		]);
	});

	// The old PATCH hard-coded `acknowledgedHistoricalLabelChange: true` at all
	// three call sites, so a client could not say it had not confirmed a rename.
	it('carries a withheld rename acknowledgement, and confirms an absent one', () => {
		const withheld = build(
			lures,
			'foundation.updateCollectionLure',
			request({ name: 'Hay infusion', acknowledgedHistoricalLabelChange: false }),
		);
		const absent = build(
			lures,
			'foundation.updateCollectionLure',
			request({ name: 'Hay infusion' }),
		);

		expect(withheld.payload).toMatchObject({ acknowledgedHistoricalLabelChange: false });
		expect(absent.payload).toMatchObject({ acknowledgedHistoricalLabelChange: true });
	});

	/*
	 * `columns` is what keeps a catalog from reading a column its table does not
	 * have. Nothing else would: the domain builders take their input by spread, so
	 * an argument they do not declare is dropped without a type error, and the
	 * write would simply lose the field.
	 */
	it('does not read custom_schema or action_threshold for a collection lure', () => {
		const created = build(
			lures,
			'foundation.createCollectionLure',
			request({ name: 'Hay infusion', custom_schema: { fields: [] }, action_threshold: 25 }),
		);
		const updated = build(
			lures,
			'foundation.updateCollectionLure',
			request({ custom_schema: { fields: [] }, action_threshold: 25, name: 'Hay infusion' }),
		);

		expect(created.payload).not.toHaveProperty('customSchema');
		expect(created.payload).not.toHaveProperty('actionThreshold');
		expect((updated.payload as { changes: object }).changes).not.toHaveProperty('customSchema');
		expect((updated.payload as { changes: object }).changes).not.toHaveProperty('actionThreshold');
	});

	it('does not read action_threshold for a habitat type, but does read custom_schema', () => {
		const command = build(
			habitatTypes,
			'foundation.createHabitatType',
			request({ name: 'Storm drain', custom_schema: { fields: [] }, action_threshold: 25 }),
		);

		expect(command.payload).toMatchObject({ customSchema: { fields: [] } });
		expect(command.payload).not.toHaveProperty('actionThreshold');
	});
});
