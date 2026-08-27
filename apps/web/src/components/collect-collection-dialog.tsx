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
