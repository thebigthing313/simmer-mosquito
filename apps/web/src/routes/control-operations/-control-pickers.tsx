import type { HabitatRow } from '@simmer-mosquito/sync';
import { and, eq, ilike, or, useLiveQuery } from '@tanstack/react-db';
import { useDeferredValue, useRef, useState } from 'react';
import { OptionRow, PickerFallback, PickerFrame } from '../../components/pickers/entity-picker';
import { webCollections } from '../../sync/webCollections';
import { habitatDisplayName } from './-control-display';

// Control actions pick an address (shared, on-demand subset search) or a habitat
// when the work was done against a known larval site. Habitats sync on demand
// (docs/sync.md), so results come from a live `ilike` subset query rather than a
// client-side filter over an eager set.

export { AddressPicker } from '../../components/pickers/address-picker';

const habitatSearchGcTimeMs = 30_000;

export function HabitatPicker({
	label = 'Habitat',
	organizationId,
	value,
	onSelect,
}: {
	readonly label?: string;
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (habitat: HabitatRow | null) => void;
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
			placeholder="Search habitats"
			search={search}
			selectedLabel={selectedLabel}
			value={value}
		>
			<HabitatResults
				onSelect={(habitat) => {
					setSelectedLabel(habitatDisplayName(habitat));
					setSearch(habitatDisplayName(habitat));
					onSelect(habitat);
					setOpen(false);
				}}
				organizationId={organizationId}
				search={deferredSearch}
				selectedValue={value}
			/>
		</PickerFrame>
	);
}

function HabitatResults({
	organizationId,
	search,
	selectedValue,
	onSelect,
}: {
	readonly organizationId: string;
	readonly search: string;
	readonly selectedValue: string | null;
	readonly onSelect: (habitat: HabitatRow) => void;
}) {
	const normalized = search.trim();
	const pattern = `%${normalized}%`;
	const { data, isReady, isError } = useLiveQuery(
		{
			gcTime: habitatSearchGcTimeMs,
			query: (query) => {
				const habitats = query.from({ habitat: webCollections.habitats });
				const scoped =
					normalized.length === 0
						? habitats.where(({ habitat }) =>
								and(eq(habitat.organizationId, organizationId), eq(habitat.isActive, true)),
							)
						: habitats.where(({ habitat }) =>
								and(
									and(eq(habitat.organizationId, organizationId), eq(habitat.isActive, true)),
									or(ilike(habitat.habitatName, pattern), ilike(habitat.description, pattern)),
								),
							);
				return scoped.orderBy(({ habitat }) => habitat.habitatName, 'asc').limit(6);
			},
		},
		[organizationId, pattern],
	);

	if (isError) {
		return <PickerFallback label="Habitats unavailable" />;
	}
	if (!isReady && (data ?? []).length === 0) {
		return <PickerFallback label="Searching habitats" />;
	}
	const habitats = (data ?? []) as readonly HabitatRow[];
	if (habitats.length === 0) {
		return <PickerFallback label="No habitat matches" />;
	}

	return (
		<div className="grid gap-1">
			{habitats.map((habitat) => (
				<OptionRow
					key={habitat.id}
					onSelect={() => onSelect(habitat)}
					primary={habitatDisplayName(habitat)}
					secondary={habitat.description}
					selected={habitat.id === selectedValue}
				/>
			))}
		</div>
	);
}
