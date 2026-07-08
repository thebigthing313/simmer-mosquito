import type { AddressRow, TrapRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { CheckIcon, SearchIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { and, eq, ilike, useLiveQuery } from '@tanstack/react-db';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { webCollections } from '../../sync/webCollections';
import { trapDisplayName } from './-adult-display';

// Shared search-and-pick controls for the adult forms. Both open a popover under a
// search input; the trap picker filters the eager `traps` set client-side while the
// address picker runs a live ilike subset against the on-demand `addresses`.

const searchGcTimeMs = 30_000;

function PickerFrame({
	label,
	value,
	open,
	search,
	selectedLabel,
	placeholder,
	anchorRef,
	onSearchChange,
	onOpen,
	onClear,
	onOpenChange,
	children,
}: {
	readonly label: string;
	readonly value: string | null;
	readonly open: boolean;
	readonly search: string;
	readonly selectedLabel: string;
	readonly placeholder: string;
	readonly anchorRef: React.RefObject<HTMLDivElement | null>;
	readonly onSearchChange: (value: string) => void;
	readonly onOpen: () => void;
	readonly onClear: () => void;
	readonly onOpenChange: (open: boolean) => void;
	readonly children: React.ReactNode;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">{label}</span>
			<Popover onOpenChange={onOpenChange} open={open}>
				<PopoverAnchor asChild>
					<div className="relative" ref={anchorRef}>
						<SearchIcon
							aria-hidden="true"
							className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
						/>
						<Input
							className="pr-10 pl-9"
							onChange={(event) => onSearchChange(event.target.value)}
							onFocus={onOpen}
							placeholder={placeholder}
							value={open ? search : selectedLabel}
						/>
						{value === null ? null : (
							<Button
								aria-label={`Clear ${label.toLowerCase()}`}
								className="-translate-y-1/2 absolute top-1/2 right-1.5"
								onClick={onClear}
								size="icon-xs"
								type="button"
								variant="ghost"
							>
								<XIcon aria-hidden="true" />
							</Button>
						)}
					</div>
				</PopoverAnchor>
				<PopoverContent
					align="start"
					className="grid w-(--radix-popover-trigger-width) min-w-80 gap-2 p-2"
					onInteractOutside={(event) => {
						const target = event.detail.originalEvent.target as Node | null;
						if (target !== null && anchorRef.current?.contains(target)) {
							event.preventDefault();
						}
					}}
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					{children}
				</PopoverContent>
			</Popover>
		</div>
	);
}

function OptionRow({
	primary,
	secondary,
	selected,
	onSelect,
}: {
	readonly primary: string;
	readonly secondary?: string | null;
	readonly selected: boolean;
	readonly onSelect: () => void;
}) {
	return (
		<button
			className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
			onClick={onSelect}
			type="button"
		>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium">{primary}</span>
				{secondary === undefined || secondary === null || secondary.length === 0 ? null : (
					<span className="block truncate text-muted-foreground text-xs">{secondary}</span>
				)}
			</span>
			{selected ? <CheckIcon aria-hidden="true" /> : null}
		</button>
	);
}

function Fallback({ label }: { readonly label: string }) {
	return (
		<div className="flex min-h-16 items-center justify-center gap-2 rounded-md bg-muted/50 text-muted-foreground text-sm">
			<SearchIcon aria-hidden="true" />
			{label}
		</div>
	);
}

// --- address picker ---------------------------------------------------------

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
		return <Fallback label="Addresses unavailable" />;
	}
	if (!isReady && (data ?? []).length === 0) {
		return <Fallback label="Searching addresses" />;
	}
	const addresses = (data ?? []) as readonly AddressRow[];
	if (addresses.length === 0) {
		return <Fallback label="No address matches" />;
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

// --- trap picker ------------------------------------------------------------

export function TrapPicker({
	label = 'Trap',
	traps,
	value,
	onSelect,
}: {
	readonly label?: string;
	readonly traps: readonly TrapRow[];
	readonly value: string | null;
	readonly onSelect: (trap: TrapRow | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedLabel, setSelectedLabel] = useState(() => {
		const current = traps.find((trap) => trap.id === value);
		return current === undefined ? '' : trapDisplayName(current);
	});
	const anchorRef = useRef<HTMLDivElement>(null);

	const normalized = search.trim().toLowerCase();
	const matches = useMemo(() => {
		const active = traps.filter((trap) => trap.isActive);
		const filtered =
			normalized.length === 0
				? active
				: active.filter((trap) =>
						`${trap.trapName ?? ''} ${trap.trapCode ?? ''}`.toLowerCase().includes(normalized),
					);
		return filtered.slice(0, 8);
	}, [traps, normalized]);

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
			placeholder="Search traps"
			search={search}
			selectedLabel={selectedLabel}
			value={value}
		>
			{matches.length === 0 ? (
				<Fallback label={traps.length === 0 ? 'No traps yet' : 'No trap matches'} />
			) : (
				<div className="grid gap-1">
					{matches.map((trap) => (
						<OptionRow
							key={trap.id}
							onSelect={() => {
								setSelectedLabel(trapDisplayName(trap));
								setSearch(trapDisplayName(trap));
								onSelect(trap);
								setOpen(false);
							}}
							primary={trapDisplayName(trap)}
							secondary={trap.description}
							selected={trap.id === value}
						/>
					))}
				</div>
			)}
		</PickerFrame>
	);
}
