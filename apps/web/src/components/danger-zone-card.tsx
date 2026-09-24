import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { type ReactNode, useState } from 'react';
import {
	type DeleteImpactEntry,
	impactCountLabel,
	useDeleteImpact,
} from '../hooks/use-delete-impact';
import { recordNoun } from '../lib/record-nouns';
import { DELETE_FLOOR, RecordDeleteDialog, type RecordDeleteProps } from './record-delete-dialog';
import { WriteOnly } from './write-only';

const DeleteIcon = iconRegistry.actions.delete.icon;

export type DangerZoneCardProps = RecordDeleteProps;

/**
 * Deleting a record from a surface that has no `...` menu to put it in.
 *
 * Record detail pages do not use this any more. Their delete is the last item
 * in {@link DetailPageHeader}'s menu, and {@link RecordDeleteDialog} carries
 * everything this card used to say on the page: what goes with the record, what
 * survives with its link cleared, and what is still referencing it. The card
 * spent a block at the foot of every record on an action wanted on almost no
 * visit, and repeated the impact list twice on the way to one decision.
 *
 * What is left are four surfaces with nowhere else to put it: the mission and
 * route detail pages and the assignment edit page, which are not on
 * `DetailPageShell`, and the notification registration panel, which is a drawer
 * beside a map rather than a page. Each keeps the card until it has a header
 * that can hold the item.
 *
 * Hidden entirely for roles that cannot delete this kind of record, matching
 * every other control that starts a write: the answer to "why can't I?" is a
 * fact about the account, not about the record on screen.
 */
export function DangerZoneCard(props: DangerZoneCardProps) {
	return (
		<WriteOnly minimum={DELETE_FLOOR[props.recordType]}>
			<DangerZone {...props} />
		</WriteOnly>
	);
}

function DangerZone(props: DangerZoneCardProps) {
	const { recordType, recordId } = props;
	const { one, title } = recordNoun(recordType);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const impactQuery = useDeleteImpact(recordType, recordId);

	const blockers = impactQuery.data?.blockers ?? [];
	const isBlocked = blockers.length > 0;

	// Quiet by default. This sits at the foot of a record the operator came to
	// read, not to destroy, and a full-size destructive block there competes
	// with the record for attention every visit while being wanted on almost
	// none of them. The destructive colour is spent on the button, the thing
	// that actually does it, and on the confirmation.
	return (
		<Card className="border-destructive/20" variant="panel">
			<CardHeader className="gap-1 px-3 pt-3 pb-0">
				<CardTitle className={eyebrow()}>Delete This {title}</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-2 px-3 pt-2 pb-3">
				{impactQuery.isPending ? (
					<ImpactSkeleton />
				) : impactQuery.isError ? (
					<p className="m-0 text-muted-foreground text-xs">
						Could not check what deleting this would affect.
					</p>
				) : isBlocked ? (
					<BlockedReasons blockers={blockers} noun={one} />
				) : (
					<p className="m-0 text-muted-foreground text-xs">
						This {one} will be removed. This can't be undone.
					</p>
				)}

				<div>
					<Button
						disabled={isBlocked || impactQuery.isPending}
						onClick={() => setConfirmOpen(true)}
						size="xs"
						variant="destructive"
					>
						<DeleteIcon aria-hidden="true" />
						Delete {title}
					</Button>
				</div>
			</CardContent>

			<RecordDeleteDialog {...props} onOpenChange={setConfirmOpen} open={confirmOpen} />
		</Card>
	);
}

function BlockedReasons({
	blockers,
	noun,
}: {
	readonly blockers: readonly DeleteImpactEntry[];
	readonly noun: string;
}) {
	return (
		<div className="grid gap-1 text-xs">
			<span className="text-foreground">Still in use by:</span>
			<ul className="m-0 grid list-none gap-0.5 p-0 text-foreground">
				{blockers.map((entry) => (
					<li key={entry.key}>{impactCountLabel(entry)}</li>
				))}
			</ul>
			<span className="text-muted-foreground">Remove these before deleting the {noun}.</span>
		</div>
	);
}

function ImpactSkeleton(): ReactNode {
	return (
		<div className="grid gap-1.5">
			<Skeleton className="h-3 w-24" />
			<Skeleton className="h-3 w-48" />
		</div>
	);
}
