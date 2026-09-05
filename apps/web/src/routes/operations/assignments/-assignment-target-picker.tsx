import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo, useRef, useState } from 'react';
import { OptionRow, PickerFallback, PickerFrame } from '../../../components/pickers/entity-picker';
import { trapDisplayName } from '../../../hooks/queries/trap-view';
import { type TrapListing, useActiveTraps } from '../../../hooks/queries/use-active-traps';
import { addresses } from '../../../lib/collections/addresses';
import { TrapPicker } from '../../adult-surveillance/-adult-pickers';
import { HabitatPicker } from '../../control-operations/-control-pickers';
import type { OpenServiceRequest, TargetType } from './-assignment-data';
import { useOpenServiceRequests } from './-assignment-data';

// Adding a stop to a worklist. An assignment mixes traps, habitats, and service
// requests freely, so the control is a type switch over three pickers rather than
// one combined search — each catalog already searches the way it wants to (eager
// filter, live `ilike` subset, open-requests list), and merging them would mean
// rebuilding all three to agree on one.

const addressGcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

const TYPE_TABS: readonly { readonly type: TargetType; readonly label: string }[] = [
	{ type: 'habitat', label: 'Habitat' },
	{ type: 'trap', label: 'Trap' },
	{ type: 'serviceRequest', label: 'Service Request' },
];

export interface AssignmentTargetSelection {
	readonly type: TargetType;
	readonly id: string;
	readonly name: string;
}

/**
 * The add-a-stop control: pick a kind, pick a record, add it.
 *
 * Pickers only offer records still in service — an active trap, an active
 * habitat, an open request. That is deliberately narrower than what the stop
 * list *displays*: an assignment is a snapshot, so a stop whose target was
 * retired afterwards stays on the worklist with its place in the order. You
 * simply cannot plan new work against it.
 */
export function AssignmentTargetPicker({
	organizationId,
	existingKeys,
	disabled = false,
	onAdd,
}: {
	readonly organizationId: string;
	/** `type:id` for every stop already on the worklist, so re-adding can be caught. */
	readonly existingKeys: ReadonlySet<string>;
	readonly disabled?: boolean;
	readonly onAdd: (selection: AssignmentTargetSelection) => void;
}) {
	const [type, setType] = useState<TargetType>('habitat');
	const [selection, setSelection] = useState<AssignmentTargetSelection | null>(null);
	const { traps } = useActiveTraps();

	const alreadyOnList = selection !== null && existingKeys.has(`${selection.type}:${selection.id}`);

	return (
		<div className="grid gap-2">
			<div className="flex flex-wrap gap-1.5">
				{TYPE_TABS.map((tab) => (
					<button
						aria-pressed={tab.type === type}
						className={cn(
							'rounded-md border px-2.5 py-1 font-medium text-xs transition-colors',
							tab.type === type
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-border text-muted-foreground hover:text-foreground',
						)}
						disabled={disabled}
						key={tab.type}
						onClick={() => {
							setType(tab.type);
							setSelection(null);
						}}
						type="button"
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Keyed by type so switching tabs mounts a fresh picker rather than
			    leaving the previous catalog's search text in the box. */}
			{type === 'habitat' ? (
				<HabitatTargetPicker
					key="habitat"
					onSelect={setSelection}
					organizationId={organizationId}
					value={selection?.type === 'habitat' ? selection.id : null}
				/>
			) : type === 'trap' ? (
				<TrapTargetPicker
					key="trap"
					onSelect={setSelection}
					traps={traps}
					value={selection?.type === 'trap' ? selection.id : null}
				/>
			) : (
				<ServiceRequestPicker
					key="serviceRequest"
					onSelect={setSelection}
					value={selection?.type === 'serviceRequest' ? selection.id : null}
				/>
			)}

			{alreadyOnList ? (
				<p className="m-0 text-muted-foreground text-xs">
					{selection?.name} is already a stop on this assignment.
				</p>
			) : null}

			<div>
				<Button
					disabled={disabled || selection === null || alreadyOnList}
					onClick={() => {
						if (selection !== null) {
							onAdd(selection);
							setSelection(null);
						}
					}}
					size="sm"
					type="button"
					variant="outline"
				>
					Add Stop
				</Button>
			</div>
		</div>
	);
}

/** The control-operations habitat picker, narrowed to a target selection. */
function HabitatTargetPicker({
	organizationId,
	value,
	onSelect,
}: {
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (selection: AssignmentTargetSelection | null) => void;
}) {
	return (
		<HabitatPicker
			label="Habitat"
			onSelect={(habitat) =>
				onSelect(habitat === null ? null : { type: 'habitat', id: habitat.id, name: habitat.name })
			}
			organizationId={organizationId}
			value={value}
		/>
	);
}

/** The adult-surveillance trap picker, narrowed to a target selection. */
function TrapTargetPicker({
	traps,
	value,
	onSelect,
}: {
	readonly traps: readonly TrapListing[];
	readonly value: string | null;
	readonly onSelect: (selection: AssignmentTargetSelection | null) => void;
}) {
	return (
		<TrapPicker
			label="Trap"
			onSelect={(trap) =>
				onSelect(trap === null ? null : { type: 'trap', id: trap.id, name: trapDisplayName(trap) })
			}
			traps={traps}
			value={value}
		/>
	);
}

/**
 * Open service requests, searched in memory.
 *
 * The other two catalogs already have a picker; this one did not, because
 * nothing else plans work against a request. It filters the open requests
 * already streaming — the same set the worklist map reads — rather than opening
 * a second subset. No organization is passed: the shape is scoped server-side,
 * so the only rows it could ever hold are this organization's.
 */
function ServiceRequestPicker({
	value,
	onSelect,
}: {
	readonly value: string | null;
	readonly onSelect: (selection: AssignmentTargetSelection | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedLabel, setSelectedLabel] = useState('');
	const anchorRef = useRef<HTMLDivElement>(null);

	const { requests, isReady } = useOpenServiceRequests();
	const addressById = useRequestAddresses(requests);

	const normalized = search.trim().toLowerCase();
	const matches = useMemo(() => {
		const labelled = requests.map((request) => ({
			request,
			label: addressById.get(request.addressId) ?? `Request ${request.id.slice(0, 8)}`,
		}));
		const filtered =
			normalized.length === 0
				? labelled
				: labelled.filter(
						(entry) =>
							entry.label.toLowerCase().includes(normalized) ||
							(entry.request.details ?? '').toLowerCase().includes(normalized),
					);
		return filtered.slice(0, 8);
	}, [requests, addressById, normalized]);

	return (
		<PickerFrame
			anchorRef={anchorRef}
			label="Service request"
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
			placeholder="Search open requests"
			search={search}
			selectedLabel={selectedLabel}
			value={value}
		>
			{matches.length === 0 ? (
				<PickerFallback
					label={
						isReady
							? requests.length === 0
								? 'No open requests'
								: 'No request matches'
							: 'Loading requests'
					}
				/>
			) : (
				<div className="grid gap-1">
					{matches.map(({ request, label }) => (
						<OptionRow
							key={request.id}
							onSelect={() => {
								setSelectedLabel(label);
								setSearch(label);
								onSelect({ type: 'serviceRequest', id: request.id, name: label });
								setOpen(false);
							}}
							primary={label}
							secondary={request.details}
							selected={request.id === value}
						/>
					))}
				</div>
			)}
		</PickerFrame>
	);
}

/**
 * The addresses the open requests name themselves by.
 *
 * A request has no name of its own, so the picker is unusable until these
 * resolve. Addresses sync on demand (docs/sync.md), so this is a bounded subset
 * over exactly the request set — the same second-level join the stop list does.
 */
function useRequestAddresses(requests: readonly OpenServiceRequest[]): ReadonlyMap<string, string> {
	const addressIds = useMemo(
		() => [...new Set(requests.map((request) => request.addressId))].sort(),
		[requests],
	);
	const addressKey = addressIds.join(',');

	const result = useLiveQuery(
		{
			gcTime: addressGcTimeMs,
			query: (query) =>
				query
					.from({ address: addresses() })
					.where(({ address }) =>
						inArray(address.id, addressIds.length > 0 ? addressIds : [UNMATCHABLE_ID]),
					)
					.select(({ address }) => ({ id: address.id, displayName: address.display_name })),
		},
		[addressKey],
	);

	return useMemo(
		() => new Map(result.data.map((address) => [address.id, address.displayName])),
		[result.data],
	);
}
