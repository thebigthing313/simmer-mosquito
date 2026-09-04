/**
 * The control-operations catalogs, as translations.
 *
 * Six tables that used to be two endpoints. `/control-methods/:kind` and
 * `/control-assets/:kind` each served several tables behind a path parameter, a
 * `requireKind` middleware and a `switch (kind)` in every builder; the tests
 * that matter here are that each table now reaches its own command without any
 * of that, and that the four method catalogs sharing one factory did not become
 * four maps that all build the same command.
 */

import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { AgencyCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import {
	equipmentTableCommands,
	vehicleTableCommands,
} from '../../../table-commands/control-assets.js';
import {
	applicationMethodTableCommands,
	biocontrolMethodTableCommands,
	outreachMethodTableCommands,
	sourceReductionMethodTableCommands,
} from '../../../table-commands/control-methods.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';

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

const METHOD_CATALOGS = [
	{
		table: 'application_methods',
		spec: applicationMethodTableCommands(undefined as never),
		create: 'controlOperations.createApplicationMethod',
		idKey: 'applicationMethodId',
	},
	{
		table: 'source_reduction_methods',
		spec: sourceReductionMethodTableCommands(undefined as never),
		create: 'controlOperations.createSourceReductionMethod',
		idKey: 'sourceReductionMethodId',
	},
	{
		table: 'outreach_methods',
		spec: outreachMethodTableCommands(undefined as never),
		create: 'controlOperations.createOutreachMethod',
		idKey: 'outreachMethodId',
	},
	{
		table: 'biocontrol_methods',
		spec: biocontrolMethodTableCommands(undefined as never),
		create: 'controlOperations.createBiocontrolMethod',
		idKey: 'biocontrolMethodId',
	},
] as const;

describe('control method catalogs', () => {
	it('gives each catalog its own table and its own command', () => {
		// The factory's failure mode: four maps that all build one catalog's command,
		// which no per-catalog test would catch on its own.
		const built = METHOD_CATALOGS.map((catalog) => ({
			table: catalog.spec.table,
			command: build(
				catalog.spec,
				catalog.create as AgencyCommandType,
				request({ name: 'Fogging' }),
			),
		}));

		expect(built.map((b) => b.table)).toEqual(METHOD_CATALOGS.map((c) => c.table));
		expect(built.map((b) => b.command.type)).toEqual(METHOD_CATALOGS.map((c) => c.create));
		// Each builder holds its own id argument's name.
		for (const [index, b] of built.entries()) {
			expect(b.command.payload).toHaveProperty(METHOD_CATALOGS[index]!.idKey, ROW);
		}
	});

	it('reads the name and schema off column names', () => {
		const command = build(
			applicationMethodTableCommands(undefined as never),
			'controlOperations.createApplicationMethod',
			request({ name: 'Truck ULV', custom_schema: { fields: [] } }),
		);

		expect(command.payload).toMatchObject({
			name: 'Truck ULV',
			customSchema: { fields: [] },
		});
	});

	it('tells an absent custom_schema from one sent as null', () => {
		// Absent means "not changing it"; present-and-null means "clear it". A reader
		// that tested truthiness could not say which was meant.
		const untouched = build(
			applicationMethodTableCommands(undefined as never),
			'controlOperations.updateApplicationMethod',
			request({ name: 'Truck ULV' }),
		);
		const cleared = build(
			applicationMethodTableCommands(undefined as never),
			'controlOperations.updateApplicationMethod',
			request({ custom_schema: null }),
		);

		expect((untouched.payload as { changes: object }).changes).not.toHaveProperty('customSchema');
		expect(cleared.payload).toMatchObject({ changes: { customSchema: null } });
	});

	it('deactivates and reactivates by name, not by the is_active value', () => {
		const spec = outreachMethodTableCommands(undefined as never);
		const off = build(
			spec,
			'controlOperations.deactivateOutreachMethod',
			request({ is_active: true }),
		);
		const on = build(
			spec,
			'controlOperations.reactivateOutreachMethod',
			request({ is_active: false }),
		);

		expect([off.type, on.type]).toEqual([
			'controlOperations.deactivateOutreachMethod',
			'controlOperations.reactivateOutreachMethod',
		]);
	});
});

describe('control assets', () => {
	it('reads each asset off its own name column', () => {
		// `vehicle_name` and `equipment_name` — the two tables that looked alike
		// enough to share an endpoint do not share a column name.
		const vehicle = build(
			vehicleTableCommands(undefined as never),
			'controlOperations.createVehicle',
			request({ vehicle_name: 'Unit 7' }),
		);
		const equipment = build(
			equipmentTableCommands(undefined as never),
			'controlOperations.createEquipment',
			request({ equipment_name: 'Backpack sprayer', serial_number: 'BP-0042' }),
		);

		expect(vehicle.payload).toMatchObject({ vehicleId: ROW, vehicleName: 'Unit 7' });
		expect(equipment.payload).toMatchObject({
			equipmentId: ROW,
			equipmentName: 'Backpack sprayer',
			serialNumber: 'BP-0042',
		});
	});

	it('clears a serial number sent as null and leaves an absent one', () => {
		const spec = equipmentTableCommands(undefined as never);
		const cleared = build(
			spec,
			'controlOperations.updateEquipment',
			request({ serial_number: null }),
		);
		const untouched = build(
			spec,
			'controlOperations.updateEquipment',
			request({ equipment_name: 'Backpack sprayer' }),
		);

		expect(cleared.payload).toMatchObject({ changes: { serialNumber: null } });
		expect((untouched.payload as { changes: object }).changes).not.toHaveProperty('serialNumber');
	});
});
