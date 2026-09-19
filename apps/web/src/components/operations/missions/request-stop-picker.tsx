import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { useRef, useState } from 'react';
import type { OpenRequest } from '../../../hooks/queries/operations-view';
import { controlTypeLabel, requestDisplayName } from '../../../hooks/queries/operations-view';
import { useOpenRequestedControlActions } from '../../../hooks/queries/use-open-requested-control-actions';
import { OptionRow, PickerFallback, PickerFrame } from '../../pickers/entity-picker';

/**
 * The add-a-stop control: pick an open request, add it to the end.
 *
 * Requests are the only stop source offered because they are the only one the
 * server can place without a drawn shape — it copies the request's own geometry.
 * Requests already on this mission drop out of the list; one already on a
 * *different* mission stays, because sending two crews to the same site is a
 * legitimate plan the domain flags rather than forbids.
 */
export function RequestStopPicker({
	existingRequestIds,
	disabled = false,
	onAdd,
}: {
	readonly existingRequestIds: ReadonlySet<string>;
	readonly disabled?: boolean;
	readonly onAdd: (request: OpenRequest) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selected, setSelected] = useState<OpenRequest | null>(null);
	const anchorRef = useRef<HTMLDivElement>(null);

	// No organization argument: the shape is scoped to the caller's organization
	// server-side, so a client-side predicate on it is redundant.
	const { requests, isReady } = useOpenRequestedControlActions();
	const matches = requestMatches(requests, existingRequestIds, search);

	return (
		<div className="grid gap-2">
			<PickerFrame
				anchorRef={anchorRef}
				label="Request for control"
				onClear={() => {
					setSelected(null);
					setSearch('');
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
				selectedLabel={selected === null ? '' : requestDisplayName(selected)}
				value={selected?.id ?? null}
			>
				{matches.length === 0 ? (
					<PickerFallback label={emptyPickerLabel(isReady, requests.length)} />
				) : (
					<div className="grid gap-1">
						{matches.map((request) => (
							<OptionRow
								key={request.id}
								onSelect={() => {
									setSelected(request);
									setSearch(requestDisplayName(request));
									setOpen(false);
								}}
								primary={requestDisplayName(request)}
								secondary={controlTypeLabel(request.controlType)}
								selected={request.id === selected?.id}
							/>
						))}
					</div>
				)}
			</PickerFrame>

			<div>
				<Button
					disabled={disabled || selected === null}
					onClick={() => {
						if (selected !== null) {
							onAdd(selected);
							setSelected(null);
							setSearch('');
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

/** Open requests not already on this mission, narrowed by the search box. */
function requestMatches(
	requests: readonly OpenRequest[],
	existingRequestIds: ReadonlySet<string>,
	search: string,
): readonly OpenRequest[] {
	const normalized = search.trim().toLowerCase();
	const available = requests.filter((request) => !existingRequestIds.has(request.id));
	const filtered =
		normalized.length === 0
			? available
			: available.filter((request) =>
					requestDisplayName(request).toLowerCase().includes(normalized),
				);
	return filtered.slice(0, PICKER_RESULT_LIMIT);
}

const PICKER_RESULT_LIMIT = 8;

/** Why the picker has nothing to show: still loading, none open, or none matching. */
function emptyPickerLabel(isReady: boolean, openCount: number): string {
	if (!isReady) {
		return 'Loading requests';
	}
	return openCount === 0 ? 'No open requests' : 'No request matches';
}
