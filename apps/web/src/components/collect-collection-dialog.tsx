import type { AdultCollectionRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { useState } from 'react';
import type { StopAcknowledgements } from '../lib/stop-acknowledgements';
import { webCollections } from '../sync/webCollections';
import { DateControl } from './date-control';

/**
 * Emptying a trap that was set on an earlier visit.
 *
 * Setting a trap and collecting from it are two visits, often days apart, and
 * between them the collection exists with no specimens against it. This is the
 * second visit: it is its own command (`adultSurveillance.collectCollection`)
 * rather than an edit, because only that command can also close the assignment
 * stop the technician was sent on.
 *
 * Shared between the collection's own page and the assignment run page, which
 * are the two places a pending collection is met.
 */
export function CollectCollectionDialog({
	open,
	defaultDate,
	onConfirm,
	onOpenChange,
}: {
	readonly open: boolean;
	/** `YYYY-MM-DD`, ordinarily today. */
	readonly defaultDate: string;
	readonly onConfirm: (collectedAt: string) => void;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const [collectedAt, setCollectedAt] = useState(defaultDate);

	return (
		<Dialog
			onOpenChange={(next) => {
				if (!next) {
					setCollectedAt(defaultDate);
				}
				onOpenChange(next);
			}}
			open={open}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Collect from this trap</DialogTitle>
					<DialogDescription>Records the specimens as retrieved on this date.</DialogDescription>
				</DialogHeader>
				<DateControl
					label="Collected date"
					onChange={(next) => setCollectedAt(next)}
					required
					value={collectedAt}
				/>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
						Back
					</Button>
					<Button
						disabled={collectedAt === ''}
						onClick={() => onConfirm(collectedAt)}
						type="button"
					>
						Collect
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * The write the dialog confirms.
 *
 * Only the collect columns move, which is what routes this to the `/collect`
 * endpoint rather than the ordinary PATCH — see `isCollectOnly` in
 * `sync/adultSurveillanceMutations.ts`. `assignmentItemId` is set when the trap
 * was emptied off a stop, and links and closes that stop in the same
 * transaction.
 */
export async function collectPendingCollection(input: {
	readonly collectionId: string;
	/** `YYYY-MM-DD`. */
	readonly collectedAt: string;
	readonly actorProfileId: string | null;
	readonly assignmentItemId?: string | null;
	readonly acknowledgements?: StopAcknowledgements;
}): Promise<void> {
	await settleWrite(
		webCollections.collections.update(
			input.collectionId,
			{ metadata: { acknowledgements: input.acknowledgements ?? {} } },
			(draft) => {
				const mutable = draft as {
					-readonly [K in keyof AdultCollectionRow]: AdultCollectionRow[K];
				};
				// UTC noon, so a date never lands on the previous day for a western
				// agency — the same conversion the collection forms use.
				mutable.collectedAt = `${input.collectedAt.slice(0, 10)}T12:00:00.000Z`;
				mutable.collectedByProfileId = input.actorProfileId;
				if (input.assignmentItemId != null) {
					mutable.collectedAssignmentItemId = input.assignmentItemId;
				}
			},
		),
	);
}
