/**
 * The address book, as translations.
 *
 * `addresses` is the table that had no domain command behind it at all: the
 * three `/foundation/addresses` routes wrap a payload in a `{ type, payload }`
 * literal so the permission map answers for them, and write the row directly.
 * One consequence is what most of this file is about — the PATCH built
 * `updateAddressDetails` and only that, so a location change had no name and
 * answered 501 even though the builder and the writer both existed.
 */

import { DomainValidationError } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { AgencyCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import { addressTableCommands } from '../../../table-commands/addresses.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { unimplementedCommandRoutes } from '../../../unimplemented-commands.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';
const SOURCE = '44444444-4444-4444-8444-444444444444';

const PIN = { type: 'Point', coordinates: [-121.49, 38.58] };

function request(payload: Record<string, unknown>): IntentRequest {
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
	spec: TableCommands<TCommand, unknown>,
	intent: AgencyCommandType,
	intentRequest: IntentRequest,
): TCommand {
	const builder = spec.intents[intent];
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(intentRequest);
}

const addresses = addressTableCommands(undefined as never);

describe('addresses', () => {
	it('reads an address off column names', () => {
		const command = build(
			addresses,
			'foundation.createAddress',
			request({
				display_name: '1600 Elm St',
				geometry: PIN,
				address_line_1: '1600 Elm St',
				address_line_2: 'Apt 4',
				locality: 'Sacramento',
				region: 'CA',
				postal_code: '95814',
				geocoder_response: { accuracy: 1 },
			}),
		);

		expect(command.payload).toMatchObject({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			addressId: ROW,
			displayName: '1600 Elm St',
			addressLine1: '1600 Elm St',
			addressLine2: 'Apt 4',
			locality: 'Sacramento',
			region: 'CA',
			postalCode: '95814',
			geocoderResponse: { accuracy: 1 },
			country: 'US',
		});
	});

	// The domain settles this, not the map: v1 is US-only and an absent country
	// is normalized rather than refused.
	it('defaults an absent country to US and refuses another one', () => {
		const defaulted = build(
			addresses,
			'foundation.createAddress',
			request({ display_name: '1600 Elm St', geometry: PIN }),
		);

		expect(defaulted.payload).toMatchObject({ country: 'US' });
		expect(() =>
			build(
				addresses,
				'foundation.createAddress',
				request({ display_name: '1600 Elm St', geometry: PIN, country: 'CA' }),
			),
		).toThrow(DomainValidationError);
	});

	/*
	 * The whole point of the slice. Correcting a postcode and dragging the pin is
	 * two commands over one payload, and each reads its own half — where the old
	 * PATCH built details only and the location had nowhere to go.
	 */
	it('separates a detail edit from a location edit over one payload', () => {
		const payload = request({ postal_code: '95815', geometry: PIN });

		const details = build(addresses, 'foundation.updateAddressDetails', payload);
		const location = build(addresses, 'foundation.updateAddressLocation', payload);

		expect((details.payload as { changes: object }).changes).toEqual({ postalCode: '95815' });
		expect(details.payload).not.toHaveProperty('geometry');
		expect(location.payload).toMatchObject({ addressId: ROW, geometry: PIN });
	});

	it('tells an absent address line from one sent as null', () => {
		const untouched = build(
			addresses,
			'foundation.updateAddressDetails',
			request({ locality: 'Davis' }),
		);
		const cleared = build(
			addresses,
			'foundation.updateAddressDetails',
			request({ address_line_2: null }),
		);

		expect((untouched.payload as { changes: object }).changes).not.toHaveProperty('addressLine2');
		expect(cleared.payload).toMatchObject({ changes: { addressLine2: null } });
	});

	// The stubs for both of these are gone, because the commands now have writers.
	it('no longer leaves a stub for the location update it implements', () => {
		expect(addresses.intents).toHaveProperty('foundation.updateAddressLocation');
		expect(unimplementedCommandRoutes.map((route) => route.command)).not.toContain(
			'foundation.updateAddressLocation',
		);
	});

	it('offers the merge, against the address that survives', () => {
		expect(addresses.intents).toHaveProperty('foundation.mergeAddresses');
		expect(unimplementedCommandRoutes.map((route) => route.command)).not.toContain(
			'foundation.mergeAddresses',
		);
	});

	it('reads the target from the path and the sources from the body', () => {
		// The asymmetry is the thing to keep: there is no column for "addresses
		// being folded into this one", so the id in the path is the survivor and the
		// list in the body is what is being retired. Swapping them would retire the
		// address the user was looking at.
		const command = build(
			addresses,
			'foundation.mergeAddresses',
			request({
				sourceAddressIds: [SOURCE],
				acknowledgedMergeConsolidatesHistory: true,
			}),
		);

		expect(command.payload).toMatchObject({
			targetAddressId: ROW,
			sourceAddressIds: [SOURCE],
		});
	});

	it('refuses a merge the caller withheld the acknowledgement on', () => {
		// `acknowledged` reads a withheld flag as `false` and an absent one as
		// confirmed, which is the convention every intent map shares. So the case
		// worth pinning is the explicit `false`: a client that knows about the
		// acknowledgement and has not got it yet.
		expect(() =>
			build(
				addresses,
				'foundation.mergeAddresses',
				request({
					sourceAddressIds: [SOURCE],
					acknowledgedMergeConsolidatesHistory: false,
				}),
			),
		).toThrow(DomainValidationError);
	});
});
