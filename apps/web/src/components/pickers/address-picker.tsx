import type { Address } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import { PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { ilike, or, useLiveQuery } from '@tanstack/react-db';
import { useDeferredValue, useRef, useState } from 'react';
import { useAuthSnapshot } from '../../hooks/use-auth-snapshot';
import { addressPrimaryLabel, addressSecondaryLabel } from '../../lib/address-format';
import { addresses } from '../../lib/collections/addresses';
import { OptionRow, PickerFallback, PickerFrame, useSelectedRowLabel } from './entity-picker';
import { NewAddressForm, type RequestMapPoint } from './new-address-form';

// Addresses sync on demand, so the results come from a live subset query (an
// `ilike` across the name and the postal fields) rather than a client-side filter
// over an eager set. Every row reads the same way: the address's name on top, its
// full postal line beneath.

const searchGcTimeMs = 30_000;

/**
 * Enables the inline "Create address" path. Every form that links an address
 * passes this: crews work at places the address book has not seen yet, and
 * sending them to another screen to add one loses the form they were filling in.
 *
 * The acting profile is read from the auth snapshot rather than taken as a prop
 * — it is the same value on every one of these forms, and threading it through
 * six of them only creates six chances to pass the wrong thing.
 */
export interface AddressPickerCreateOptions {
	/**
	 * Lets the new address be placed by clicking the map. Omit where the caller
	 * has no map — a dialog — and geocoding becomes the only way to place it.
	 */
	readonly requestMapPoint?: RequestMapPoint | undefined;
}

export function AddressPicker({
	label = 'Address',
	organizationId,
	value,
	onSelect,
	create,
}: {
	readonly label?: string;
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (address: AddressOption | null) => void;
	readonly create?: AddressPickerCreateOptions | undefined;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [pickedLabel, setPickedLabel] = useState('');
	const [isCreating, setIsCreating] = useState(false);
	const deferredSearch = useDeferredValue(search);
	const anchorRef = useRef<HTMLDivElement>(null);
	const snapshot = useAuthSnapshot();
	const _actorProfileId =
		snapshot?.authenticated === true ? snapshot.localIdentity.profileId : null;
	// An edit form arrives holding only the address id, so the current selection is
	// resolved from the collection rather than left as an empty-looking field.
	const selectedLabel = useSelectedRowLabel({
		collection: addresses(),
		pickedLabel,
		toLabel: (row) => addressPrimaryLabel(addressLabelParts(row)),
		value,
	});

	const pick = (address: AddressOption) => {
		const name = addressPrimaryLabel(address);
		setPickedLabel(name);
		setSearch(name);
		onSelect(address);
		setOpen(false);
	};

	return (
		<div className="grid gap-3">
			<PickerFrame
				anchorRef={anchorRef}
				label={label}
				onClear={() => {
					setPickedLabel('');
					setSearch('');
					onSelect(null);
				}}
				onOpen={() => setOpen(true)}
				onOpenChange={setOpen}
				onSearchChange={(next) => {
					setSearch(next);
					setOpen(true);
				}}
				open={open}
				placeholder="Search addresses"
				search={search}
				selectedLabel={selectedLabel}
				value={value}
			>
				<AddressResults
					onSelect={pick}
					organizationId={organizationId}
					search={deferredSearch}
					selectedValue={value}
				/>
				{create === undefined ? null : (
					<>
						<Separator />
						<Button
							className="justify-start"
							onClick={() => {
								setOpen(false);
								setIsCreating(true);
							}}
							size="sm"
							type="button"
							variant="outline"
						>
							<PlusIcon aria-hidden="true" data-icon="inline-start" />
							Create Address
						</Button>
					</>
				)}
			</PickerFrame>
			{create === undefined || !isCreating ? null : (
				<NewAddressForm
					initialSearch={search}
					onCancel={() => setIsCreating(false)}
					onCreated={(address) => {
						pick(address);
						setIsCreating(false);
					}}
					requestMapPoint={create.requestMapPoint}
				/>
			)}
		</div>
	);
}

function AddressResults({
	organizationId,
	search,
	selectedValue,
	onSelect,
}: {
	readonly organizationId: string;
	readonly search: string;
	readonly selectedValue: string | null;
	readonly onSelect: (address: AddressOption) => void;
}) {
	const normalized = search.trim();
	const pattern = `%${normalized}%`;
	const { data, isReady, isError } = useLiveQuery(
		{
			gcTime: searchGcTimeMs,
			query: (query) => {
				// No organization predicate: the shape is scoped to the organization
				// server-side, so re-stating it here is redundant — and a stale column
				// spelling in one is what empties a list rather than narrowing it.
				const base = query.from({ address: addresses() });
				const filtered =
					normalized.length === 0
						? base
						: base.where(({ address }) =>
								or(
									ilike(address.display_name, pattern),
									ilike(address.address_line_1, pattern),
									ilike(address.locality, pattern),
									ilike(address.postal_code, pattern),
								),
							);
				return filtered
					.orderBy(({ address }) => address.display_name, 'asc')
					.limit(6)
					.select(({ address }) => ({
						id: address.id,
						lat: address.lat,
						lng: address.lng,
						displayName: address.display_name,
						addressLine1: address.address_line_1,
						addressLine2: address.address_line_2,
						locality: address.locality,
						region: address.region,
						postalCode: address.postal_code,
					}));
			},
		},
		[organizationId, pattern],
	);

	if (isError) {
		return <PickerFallback label="Addresses unavailable" />;
	}
	if (!isReady && (data ?? []).length === 0) {
		return <PickerFallback label="Searching addresses" />;
	}
	const matches = data ?? [];
	if (matches.length === 0) {
		return <PickerFallback label="No address matches" />;
	}

	return (
		<div className="grid gap-1">
			{matches.map((address) => (
				<OptionRow
					key={address.id}
					onSelect={() => onSelect(address)}
					primary={addressPrimaryLabel(address)}
					secondary={addressSecondaryLabel(address)}
					selected={address.id === selectedValue}
				/>
			))}
		</div>
	);
}

/**
 * What the picker hands back.
 *
 * The label columns, plus the centroid — a form that picks an address drops its
 * pin there, so the point has to come with the choice rather than be fetched
 * again by the caller.
 */
export interface AddressOption {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly displayName: string | null;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
}

/**
 * The selected row, as the shared label formatters take it.
 *
 * `useSelectedRowLabel` hands back the collection's own row, which is spelled the
 * way Postgres spells it; the formatters in `lib/address-format.ts` are the read
 * seam's vocabulary. This is the one place the two meet.
 */
function addressLabelParts(row: Address): AddressOption {
	return {
		id: row.id,
		lat: row.lat,
		lng: row.lng,
		displayName: row.display_name,
		addressLine1: row.address_line_1,
		addressLine2: row.address_line_2,
		locality: row.locality,
		region: row.region,
		postalCode: row.postal_code,
	};
}
