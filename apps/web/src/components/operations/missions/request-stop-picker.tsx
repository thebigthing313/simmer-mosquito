import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { useState } from 'react';
import { useSearchPicker } from '../../../hooks/pickers/use-search-picker';
import type { OpenRequest } from '../../../hooks/queries/operations-view';
import { controlTypeLabel, requestDisplayName } from '../../../hooks/queries/operations-view';
import { useOpenRequestedControlActions } from '../../../hooks/queries/use-open-requested-control-actions';
import { OptionRow, PickerFallback, PickerFrame } from '../../pickers/entity-picker';

/**
 * The add-a-stop control: pick an open request, add it to the end. Requests
 * are the only stop source the server can place without a drawn shape.
 * Requests already on this mission drop out; one on a different mission stays,
 * because the domain flags that rather than forbids it.
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
	// The request held for "Add Stop", which is this field's value.
	const [selected, setSelected] = useState<OpenRequest | null>(null);
	const picker = useSearchPicker({
		value: selected?.id ?? null,
		resolvedLabel: selected === null ? '' : requestDisplayName(selected),
		onClear: () => setSelected(null),
	});

	// No organization argument: the shape is scoped to the caller's organization
	// server-side, so a client-side predicate on it is redundant.
	const { requests, isReady } = useOpenRequestedControlActions();
	const matches = requestMatches(requests, existingRequestIds, picker.search);

	return (
		<div className="grid gap-2">
			<PickerFrame {...picker.frame} label="Request for control" placeholder="Search open requests">
				{matches.length === 0 ? (
					<PickerFallback label={emptyPickerLabel(isReady, requests.length)} />
				) : (
					<div className="grid gap-1">
						{matches.map((request) => (
							<OptionRow
								key={request.id}
								onSelect={() => {
									picker.pick(request.id, requestDisplayName(request));
									setSelected(request);
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
