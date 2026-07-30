import type { AddressRow } from '@simmer-mosquito/sync';
import { and, eq, ilike, or, useLiveQuery } from '@tanstack/react-db';
import { useDeferredValue, useRef, useState } from 'react';
import { addressPrimaryLabel, addressSecondaryLabel } from '../../lib/address-format';
import { webCollections } from '../../sync/webCollections';
import { OptionRow, PickerFallback, PickerFrame, useSelectedRowLabel } from './entity-picker';

// Addresses sync on demand, so the results come from a live subset query (an
// `ilike` across the name and the postal fields) rather than a client-side filter
// over an eager set. Every row reads the same way: the address's name on top, its
// full postal line beneath.

const searchGcTimeMs = 30_000;

export function AddressPicker({
	label = 'Address',
	organizationId,
	value,
	onSelect,
}: {
	readonly label?: string;
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (address: AddressRow | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [pickedLabel, setPickedLabel] = useState('');
	const deferredSearch = useDeferredValue(search);
	const anchorRef = useRef<HTMLDivElement>(null);
	// An edit form arrives holding only the address id, so the current selection is
	// resolved from the collection rather than left as an empty-looking field.
	const selectedLabel = useSelectedRowLabel({
		collection: webCollections.addresses,
		pickedLabel,
		toLabel: addressPrimaryLabel,
		value,
	});

	return (
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
				onSelect={(address) => {
					const name = addressPrimaryLabel(address);
					setPickedLabel(name);
					setSearch(name);
					onSelect(address);
					setOpen(false);
				}}
				organizationId={organizationId}
				search={deferredSearch}
				selectedValue={value}
			/>
		</PickerFrame>
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
	readonly onSelect: (address: AddressRow) => void;
}) {
	const normalized = search.trim();
	const pattern = `%${normalized}%`;
	const { data, isReady, isError } = useLiveQuery(
		{
			gcTime: searchGcTimeMs,
			query: (query) => {
				const base = query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.organizationId, organizationId));
				const filtered =
					normalized.length === 0
						? base
						: base.where(({ address }) =>
								and(
									eq(address.organizationId, organizationId),
									or(
										ilike(address.displayName, pattern),
										ilike(address.addressLine1, pattern),
										ilike(address.locality, pattern),
										ilike(address.postalCode, pattern),
									),
								),
							);
				return filtered.orderBy(({ address }) => address.displayName, 'asc').limit(6);
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
	const addresses = (data ?? []) as readonly AddressRow[];
	if (addresses.length === 0) {
		return <PickerFallback label="No address matches" />;
	}

	return (
		<div className="grid gap-1">
			{addresses.map((address) => (
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
