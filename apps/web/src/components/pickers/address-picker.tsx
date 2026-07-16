import type { AddressRow } from '@simmer-mosquito/sync';
import { and, eq, ilike, useLiveQuery } from '@tanstack/react-db';
import { useDeferredValue, useRef, useState } from 'react';
import { webCollections } from '../../sync/webCollections';
import { OptionRow, PickerFallback, PickerFrame } from './entity-picker';

// Addresses sync on demand, so the results come from a live `ilike` subset query
// rather than a client-side filter over an eager set.

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
	const [selectedLabel, setSelectedLabel] = useState('');
	const deferredSearch = useDeferredValue(search);
	const anchorRef = useRef<HTMLDivElement>(null);

	return (
		<PickerFrame
			anchorRef={anchorRef}
			label={label}
			onClear={() => {
				setSelectedLabel('');
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
					setSelectedLabel(address.displayName);
					setSearch(address.displayName);
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
									ilike(address.displayName, pattern),
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
					primary={address.displayName}
					secondary={
						typeof address.lat === 'number' && typeof address.lng === 'number'
							? null
							: 'No coordinates on file'
					}
					selected={address.id === selectedValue}
				/>
			))}
		</div>
	);
}
