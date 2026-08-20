/**
 * The `addresses` table, as commands.
 *
 * The agency address book: the rows habitats, traps and service requests point
 * at so that a place has one spelling. Four of foundation's five address
 * commands are here.
 *
 * ## Two of these were not reachable at all
 *
 * `/foundation/addresses` never built a domain command. Its three routes wrap a
 * payload in a `{ type, payload }` literal so `denyUnauthorizedAgencyCommands`
 * still answers for them, and write the row directly — which is why the PATCH
 * builds `updateAddressDetails` and only that. A location change had nowhere to
 * go: `updateAddressLocation` was a stub answering 501, even though both the
 * domain builder and the `packages/db` writer for it already existed. Naming the
 * command is what makes it reachable, and `writeAddressCommand` in
 * `foundation-commands/addresses.ts` is the writer that fits `runCommands`.
 *
 * ## The merge
 *
 * `foundation.mergeAddresses` is here now. Folding one address into another
 * means re-pointing every row that names the ones being retired, across four
 * domains, and `applyRecordMerge` in `packages/db` is what does it — driven by
 * the same registry that decides what blocks an address delete, so the twelve
 * tables that refuse the delete are the twelve the merge moves.
 *
 * It is a PATCH against the surviving address, not a route of its own, because
 * the row it answers with is that address.
 *
 * ## Field names
 *
 * Postgres column names: `display_name`, `country`, `address_line_1`,
 * `address_line_2`, `locality`, `region`, `postal_code`, `geocoder_response`.
 *
 * `geometry` is the exception, as it is on `regions`: the point lives in `geom`,
 * and `lat`, `lng` and `geojson` are generated columns nothing writes. So
 * `geometry` names the instruction — the point to store — not a column.
 *
 * `region` is a column here and a table elsewhere, and they are unrelated: this
 * one is the state in a postal address, and the domain normalizes it as a US
 * state code.
 */

import type { SafeAddress } from '@simmer-mosquito/db';
import {
	createAddressCommand,
	deleteAddressCommand,
	type FoundationCommand,
	mergeAddressesCommand,
	updateAddressDetailsCommand,
	updateAddressLocationCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import { type CommandDb, readStringArray } from '../command-write.js';
import { writeAddressCommand } from '../foundation-commands/addresses.js';
import { toAddressResponse } from '../foundation-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

type AddressResponse = ReturnType<typeof toAddressResponse>;

export function addressTableCommands(
	db: CommandDb,
): TableCommands<FoundationCommand, AddressResponse> {
	return {
		table: 'addresses',
		run: {
			db,
			// The response shape is chosen here rather than in the writer, so the
			// writer keeps returning `SafeAddress | null` and the 404 still keys off a
			// null row.
			write: async (trx, command) => {
				const row: SafeAddress | null = await writeAddressCommand(trx, command);
				return row === null ? null : toAddressResponse(row);
			},
			notFound: 'address_not_found',
			key: 'address',
		},
		intents: {
			'foundation.createAddress': ({ payload, agency, id }) =>
				createAddressCommand({
					...agency,
					addressId: id,
					displayName: readText(payload.display_name) ?? '',
					// Passed through untyped: which geometries an address accepts is the
					// domain builder's rule, and re-stating it here would be a second copy
					// of it that could disagree.
					geometry: payload.geometry,
					country: readNullableText(payload.country),
					addressLine1: readNullableText(payload.address_line_1),
					addressLine2: readNullableText(payload.address_line_2),
					locality: readNullableText(payload.locality),
					region: readNullableText(payload.region),
					postalCode: readNullableText(payload.postal_code),
					geocoderResponse: payload.geocoder_response ?? null,
				}),

			// The two updates read only what they take. A save that corrected a
			// postcode and dragged the pin names both, and each reads its own half of
			// one payload — which is the thing the old PATCH could not express,
			// because it built one command and the location had no name.
			'foundation.updateAddressDetails': ({ payload, agency, id }) =>
				updateAddressDetailsCommand({
					...agency,
					addressId: id,
					...('display_name' in payload
						? { displayName: readText(payload.display_name) ?? '' }
						: {}),
					...('address_line_1' in payload
						? { addressLine1: readNullableText(payload.address_line_1) }
						: {}),
					...('address_line_2' in payload
						? { addressLine2: readNullableText(payload.address_line_2) }
						: {}),
					...('locality' in payload ? { locality: readNullableText(payload.locality) } : {}),
					...('region' in payload ? { region: readNullableText(payload.region) } : {}),
					...('postal_code' in payload
						? { postalCode: readNullableText(payload.postal_code) }
						: {}),
					...('geocoder_response' in payload
						? { geocoderResponse: payload.geocoder_response ?? null }
						: {}),
				}),

			'foundation.updateAddressLocation': ({ payload, agency, id }) =>
				updateAddressLocationCommand({ ...agency, addressId: id, geometry: payload.geometry }),

			// The row this write names is the *target* — the address that survives —
			// and the sources come from the body, because there is no column for
			// "addresses being folded into this one". Same shape as
			// `publicEngagement.mergeContacts`.
			'foundation.mergeAddresses': ({ payload, agency, id }) =>
				mergeAddressesCommand({
					...agency,
					targetAddressId: id,
					sourceAddressIds: readStringArray(payload.sourceAddressIds),
					acknowledgedMergeConsolidatesHistory: acknowledged(
						payload.acknowledgedMergeConsolidatesHistory,
					),
				}),

			'foundation.deleteAddress': ({ agency, id }) =>
				deleteAddressCommand({ ...agency, addressId: id }),
		},
	};
}
