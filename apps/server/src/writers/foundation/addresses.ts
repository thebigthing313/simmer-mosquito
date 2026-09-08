import {
	type AddressRow,
	applyRecordDeletion,
	applyRecordMerge,
	createAddress,
	deleteAddress,
	getAddressRowById,
	updateAddressDetails,
	updateAddressLocation,
} from '@simmer-mosquito/db';
import type { FoundationCommand } from '@simmer-mosquito/domain';
import type { CommandTransaction } from '../../command-write.js';

/**
 * One address command's worth of work, inside the caller's transaction.
 *
 * `addresses` was the one foundation table with no writer of this shape. The
 * three routes above do not build a domain command at all — they wrap a payload
 * in a `{ type, payload }` literal so the permission map still answers for them,
 * then call a `*WithTxid` helper that opens a transaction of its own. That works
 * for one route committing one write, and does not fit `runCommands`, which
 * commits a batch and asserts ownership per command.
 *
 * So this is new, and it is what `/commands/addresses` writes through. It is
 * deliberately the same four `packages/db` calls the helpers make, in the same
 * order, with the same `applyRecordDeletion` in front of the delete — the
 * transaction is the only thing that moved.
 *
 * `foundation.mergeAddresses` is the one command here that writes rows in other
 * domains. `applyRecordMerge` re-points every trap, habitat, inspection,
 * application, service request and mission stop that named a source, then the
 * sources are soft-deleted, in that order, because a rule finds its rows by the
 * source id and a source already deleted is not one of them.
 *
 * Nothing about the target changes. The merge picks a survivor; it does not
 * blend the retired addresses' fields into it, and every operational row keeps
 * the geometry snapshot it took when the work happened.
 */
export async function writeAddressCommand(
	trx: CommandTransaction,
	command: FoundationCommand,
): Promise<AddressRow | null> {
	switch (command.type) {
		case 'foundation.createAddress':
			return createAddress(trx, {
				id: command.payload.addressId,
				organizationId: command.payload.organizationId,
				geojson: command.payload.geometry,
				displayName: command.payload.displayName,
				country: command.payload.country,
				addressLine1: command.payload.addressLine1,
				addressLine2: command.payload.addressLine2,
				locality: command.payload.locality,
				region: command.payload.region,
				postalCode: command.payload.postalCode,
				geocoderResponse: command.payload.geocoderResponse,
				createdByProfileId: command.payload.actorProfileId,
				updatedByProfileId: command.payload.actorProfileId,
			});
		case 'foundation.updateAddressDetails':
			// `changes` is spread rather than read key by key for the same reason the
			// region writer does it: `updateAddressDetails` itself reads presence with
			// `'displayName' in input`, so a key the command did not carry has to stay
			// absent rather than arrive as undefined.
			return updateAddressDetails(trx, command.payload.addressId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				updatedByProfileId: command.payload.actorProfileId,
			});
		case 'foundation.updateAddressLocation':
			return updateAddressLocation(trx, command.payload.addressId, {
				organizationId: command.payload.organizationId,
				geojson: command.payload.geometry,
				updatedByProfileId: command.payload.actorProfileId,
			});
		case 'foundation.mergeAddresses': {
			await applyRecordMerge(trx, {
				recordType: 'address',
				targetId: command.payload.targetAddressId,
				sourceIds: command.payload.sourceAddressIds,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			// Not `applyRecordDeletion` for each source: the references it would
			// refuse over are the ones the merge has just moved, and re-running the
			// address policy would then find the comments and tags it already dealt
			// with. The rows are empty of references by now, so what is left is
			// retiring them.
			for (const sourceId of command.payload.sourceAddressIds) {
				await deleteAddress(trx, sourceId, {
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
				});
			}
			// The survivor, unchanged. Read rather than returned by a write, because
			// the merge does not touch it.
			return (
				(await getAddressRowById(trx, {
					id: command.payload.targetAddressId,
					organizationId: command.payload.organizationId,
				})) ?? null
			);
		}
		case 'foundation.deleteAddress':
			// An address is kept alive by whatever still names it, so this is the one
			// delete that routinely refuses. `applyRecordDeletion` raises
			// `RecordDeleteBlockedError`, which `handleCommandError` answers as a 409
			// saying what is holding it.
			await applyRecordDeletion(trx, {
				recordType: 'address',
				recordId: command.payload.addressId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				// Nothing to confirm: every operational rule on an address blocks, so
				// the delete is refused outright rather than asked about, and what is
				// left is the address's own comments and tags.
				acknowledged: {},
			});
			return deleteAddress(trx, command.payload.addressId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
		default:
			throw new Error(`Unsupported address command: ${command.type}`);
	}
}
