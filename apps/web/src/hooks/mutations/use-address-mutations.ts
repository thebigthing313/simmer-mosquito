/**
 * The agency address book: adding a place, correcting one, moving its pin.
 *
 * ## The pin was unreachable
 *
 * `/foundation/addresses` never built a domain command. Its PATCH wrote the row
 * directly and only ever meant `updateAddressDetails`; `updateAddressLocation`
 * was a stub answering 501, even though both the domain builder and the
 * `packages/db` writer for it already existed. So an edit that dragged the pin
 * saved everything *except* the pin, and said nothing.
 *
 * {@link AddressMutations.save} names one command or two, from what actually
 * moved. A save that corrected a postcode and dragged the pin names both, and
 * each server-side builder reads its own half of the one body.
 *
 * ## `geometry` is an argument, not a location source
 *
 * The other location-bearing commands take a *source* — a shape the user drew,
 * or a row to copy a shape from — because the record's geometry is a snapshot of
 * something else. An address is different: the point *is* the record, so the
 * command takes the point itself. It rides as an argument because there is no
 * column for it — `geom` never syncs, and `lat`/`lng`/`geom_type` are maintained
 * by the trigger.
 *
 * The centroid columns are still written optimistically, because the pin on
 * screen has to move before the server answers. They come from the helper that
 * mirrors the `set_owned_centroid()` trigger, so the optimistic `geom_type` is
 * the column's own `st_point` rather than GeoJSON's `Point`.
 *
 * ## `country` is fixed at create
 *
 * `updateAddressDetails` has no reader for it. Changing which country an address
 * is in is a different address.
 */

import { type GeoJsonPoint, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { type Address, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { addresses } from '../../lib/collections/addresses';
import { mutateCollection } from '../../lib/collections/mutate';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId, optimisticStamp } from './shared';

/** An address as its form holds one, before the point. */
export interface AddressFields {
	readonly displayName: string;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	/** Whatever the geocoder said, kept whole so a later correction has provenance. */
	readonly geocoderResponse: unknown;
}

type AddressUpdateIntent = 'foundation.updateAddressDetails' | 'foundation.updateAddressLocation';

/** What an edit means, the columns it moves, and the point it carries. */
export interface AddressUpdatePlan {
	readonly intents: readonly AddressUpdateIntent[];
	readonly changes: Partial<Address>;
	/** Present only when the pin was moved. */
	readonly arguments?: Readonly<Record<string, unknown>>;
}

/**
 * Which of the two commands an edit is, from what actually changed.
 *
 * Pure and exported for its tests. `null` when nothing moved, because an
 * untouched save is not a write and the domain refuses a command with nothing to
 * change.
 */
export function addressUpdatePlan(input: {
	readonly fields: AddressFields;
	readonly current: AddressFields;
	readonly geometry: GeoJsonPoint | null;
}): AddressUpdatePlan | null {
	const { fields, current, geometry } = input;
	const intents: AddressUpdateIntent[] = [];
	const changes: Partial<Address> = {};

	if (
		fields.displayName !== current.displayName ||
		fields.addressLine1 !== current.addressLine1 ||
		fields.addressLine2 !== current.addressLine2 ||
		fields.locality !== current.locality ||
		fields.region !== current.region ||
		fields.postalCode !== current.postalCode ||
		fields.geocoderResponse !== current.geocoderResponse
	) {
		intents.push('foundation.updateAddressDetails');
		changes.display_name = fields.displayName;
		changes.address_line_1 = fields.addressLine1;
		changes.address_line_2 = fields.addressLine2;
		changes.locality = fields.locality;
		changes.region = fields.region;
		changes.postal_code = fields.postalCode;
		changes.geocoder_response = fields.geocoderResponse ?? null;
	}

	if (geometry !== null) {
		intents.push('foundation.updateAddressLocation');
		const centroid = ownedCentroidFromGeoJson(geometry);
		if (centroid !== null) {
			changes.lat = centroid.lat;
			changes.lng = centroid.lng;
			changes.geom_type = centroid.geomType;
		}
	}

	if (intents.length === 0) {
		return null;
	}

	// The argument is absent unless the location command is one of the names: an
	// argument a command has no reader for is a key the server ignores, and
	// sending one anyway makes the body claim an edit it is not making.
	return { intents, changes, ...(geometry === null ? {} : { arguments: { geometry } }) };
}

export interface AddressMutations {
	/** Returns the new address's id, so the caller can navigate to it. */
	readonly create: (
		fields: AddressFields,
		country: string,
		geometry: GeoJsonPoint,
	) => Promise<string>;
	/**
	 * Save an edited address.
	 *
	 * `geometry` is null when the pin was not moved, which is not the same as
	 * clearing it: naming the location command with the point it already has is a
	 * write with no edit behind it.
	 */
	readonly save: (
		addressId: string,
		fields: AddressFields,
		current: AddressFields,
		geometry: GeoJsonPoint | null,
	) => Promise<void>;
	readonly remove: (addressId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useAddressMutations(): AddressMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (fields: AddressFields, country: string, geometry: GeoJsonPoint) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const centroid = ownedCentroidFromGeoJson(geometry);
			if (centroid === null) {
				throw new Error('Unable to determine where the address sits.');
			}

			const now = optimisticStamp();
			const addressId = newRecordId();
			await settleWrite(
				mutateCollection(addresses(), {
					operation: 'insert',
					intent: 'foundation.createAddress',
					row: {
						id: addressId,
						organization_id: organizationId,
						lat: centroid.lat,
						lng: centroid.lng,
						geom_type: centroid.geomType,
						display_name: fields.displayName,
						country,
						address_line_1: fields.addressLine1,
						address_line_2: fields.addressLine2,
						locality: fields.locality,
						region: fields.region,
						postal_code: fields.postalCode,
						geocoder_response: fields.geocoderResponse ?? null,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies Address,
					arguments: { geometry },
				}),
			);
			return addressId;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (
			addressId: string,
			fields: AddressFields,
			current: AddressFields,
			geometry: GeoJsonPoint | null,
		) => {
			const plan = addressUpdatePlan({ fields, current, geometry });
			if (plan === null) {
				return;
			}

			await settleWrite(
				mutateCollection(addresses(), {
					operation: 'update',
					intent: plan.intents,
					key: addressId,
					changes: {
						...plan.changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					...(plan.arguments === undefined ? {} : { arguments: plan.arguments }),
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(async (addressId: string) => {
		await settleWrite(
			mutateCollection(addresses(), {
				operation: 'delete',
				intent: 'foundation.deleteAddress',
				key: addressId,
			}),
		);
	}, []);

	return {
		create,
		save,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
