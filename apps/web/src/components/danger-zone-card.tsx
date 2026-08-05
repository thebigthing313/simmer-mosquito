import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useQueryClient } from '@tanstack/react-query';
import { type LinkProps, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
	type DeletableRecordType,
	type DeleteImpact,
	type DeleteImpactEntry,
	deleteImpactQueryKey,
	impactCountLabel,
	useDeleteImpact,
} from '../hooks/use-delete-impact';
import type { MinimumRole } from '../lib/write-access';
import { readBlockers } from '../sync/command-error';
import { settleWrite } from '../sync/settle-write';
import { WriteOnly } from './write-only';

const DeleteIcon = iconRegistry.actions.delete.icon;

export interface DangerZoneCardProps {
	/** The server-side record kind, which decides the delete policy. */
	readonly recordType: DeletableRecordType;
	readonly recordId: string;
	/** Domain noun for the record, lower case: `habitat`, `service request`. */
	readonly noun: string;
	/** What to call this particular record in the confirmation. */
	readonly name: string;
	/** Removes the record; normally `webCollections.x.delete(id)`. */
	readonly onDelete: () => { readonly isPersisted: { readonly promise: Promise<unknown> } };
	/** Where to land once the record is gone — the list it came from. */
	readonly returnTo: NonNullable<LinkProps['to']>;
}

/**
 * Deleting a record, with its consequences stated first.
 *
 * Everything here comes from the server's delete policy rather than the page:
 * which records go with this one, which survive with their link cleared, and
 * whether the delete is refused at all. A page only says which record it is and
 * where to go afterwards, so the warning cannot fall out of step with what the
 * command actually does.
 *
 * Hidden entirely for roles that cannot delete this kind of record, matching
 * every other control that starts a write — the answer to "why can't I?" is a
 * fact about the account, not about the record on screen.
 */
export function DangerZoneCard(props: DangerZoneCardProps) {
	return (
		<WriteOnly minimum={DELETE_FLOOR[props.recordType]}>
			<DangerZone {...props} />
		</WriteOnly>
	);
}

/**
 * The role each delete needs, from `apps/server/src/command-permissions.ts`.
 *
 * Derived from `recordType` rather than taken as a prop, because a prop is
 * something a page can get wrong and this card is the only delete surface in
 * the app. A record a collector may create is one they may remove; the rest are
 * supervisory, and the control actions are manager-only in code pending #63.
 */
const DELETE_FLOOR: Record<DeletableRecordType, MinimumRole> = {
	collection: 'collector',
	inspection: 'collector',
	sample: 'collector',

	address: 'manager',
	region: 'manager',
	trap: 'manager',
	habitat: 'manager',
	contact: 'manager',
	serviceRequest: 'manager',
	route: 'manager',
	assignment: 'manager',
	mission: 'manager',
	application: 'manager',
	sourceReduction: 'manager',
	outreachAction: 'manager',
	biocontrolAction: 'manager',
	requestedControlAction: 'manager',
};

function DangerZone({ recordType, recordId, noun, name, onDelete, returnTo }: DangerZoneCardProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const impactQuery = useDeleteImpact(recordType, recordId);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [refusedBlockers, setRefusedBlockers] = useState<readonly DeleteImpactEntry[]>([]);

	const impact = impactQuery.data;
	// The impact read is what normally knows, and it disables the button up
	// front. `refusedBlockers` is the race: a reference landed while the page was
	// open, and the 409 that refused the delete carries what it was.
	const blockers = refusedBlockers.length > 0 ? refusedBlockers : (impact?.blockers ?? []);
	const isBlocked = blockers.length > 0;

	const confirmDelete = useCallback(async () => {
		setConfirmOpen(false);
		setDeleteError(null);
		setIsDeleting(true);
		try {
			await settleWrite(onDelete());
			await navigate({ to: returnTo });
		} catch (cause) {
			const blocked = readBlockers(cause);
			const message =
				blocked.length > 0
					? `Deleting this ${noun} is blocked by ${impactCountLabel(blocked[0] as DeleteImpactEntry)}.`
					: cause instanceof Error
						? cause.message
						: `Unable to delete the ${noun}.`;

			// The delete is optimistic, so the row leaves the collection the moment
			// the button is pressed and this card unmounts with the record it was
			// describing. By the time a refusal comes back there is nothing here to
			// set state on — hence the toast, which lives above the route in the
			// app shell and outlasts the rollback that puts the page back.
			toast.error(message);
			setDeleteError(message);
			// The 409 already said what stopped it, so render that rather than
			// waiting on a second read to say the same thing. The invalidation below
			// still runs; this is what fills the gap until it lands.
			setRefusedBlockers(blocked);

			// A delete refused mid-flight means something started referencing this
			// record while the page was open. Invalidate rather than refetch: this
			// goes through the cache, so it still lands when the card is gone, and
			// the remounted card reads the blockers instead of a stale all-clear.
			void queryClient.invalidateQueries({
				queryKey: deleteImpactQueryKey(recordType, recordId),
			});
			setIsDeleting(false);
		}
	}, [navigate, noun, onDelete, queryClient, recordId, recordType, returnTo]);

	return (
		<Card className="border-destructive/40" variant="panel">
			<CardHeader className="px-4 py-4">
				<CardTitle className="text-destructive">Delete This {titleCase(noun)}</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				{impactQuery.isPending ? (
					<ImpactSkeleton />
				) : impactQuery.isError ? (
					<p className="m-0 text-muted-foreground text-sm">
						Could not check what deleting this would affect.
					</p>
				) : isBlocked ? (
					<BlockedReasons blockers={blockers} noun={noun} />
				) : (
					<DeleteEffects impact={impact} noun={noun} />
				)}

				{deleteError === null ? null : (
					<p className="m-0 text-destructive text-sm">{deleteError}</p>
				)}

				<div>
					<Button
						disabled={isBlocked || isDeleting || impactQuery.isPending}
						onClick={() => setConfirmOpen(true)}
						size="sm"
						variant="destructive"
					>
						<DeleteIcon aria-hidden="true" />
						Delete {titleCase(noun)}
					</Button>
				</div>
			</CardContent>

			<AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {name}?</AlertDialogTitle>
						<AlertDialogDescription>
							{impact === undefined || !hasEffects(impact)
								? `This ${noun} will be removed. This can't be undone.`
								: `This can't be undone.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{impact === undefined || !hasEffects(impact) ? null : <EffectLists impact={impact} />}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDelete}>Delete {titleCase(noun)}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}

function DeleteEffects({
	impact,
	noun,
}: {
	readonly impact: DeleteImpact | undefined;
	readonly noun: string;
}) {
	if (impact === undefined || !impact.found) {
		return (
			<p className="m-0 text-muted-foreground text-sm">
				This {noun} will be removed. This can't be undone.
			</p>
		);
	}

	if (!hasEffects(impact)) {
		return (
			<p className="m-0 text-muted-foreground text-sm">
				Nothing else references this {noun}. This can't be undone.
			</p>
		);
	}

	return <EffectLists impact={impact} />;
}

/** True when deleting this record would reach past the record itself. */
function hasEffects(impact: DeleteImpact): boolean {
	return impact.cascades.length > 0 || impact.detaches.length > 0;
}

/**
 * What goes and what stays.
 *
 * Rendered twice — on the card, and again inside the confirmation, so the last
 * screen before the write repeats what the button was standing next to.
 */
function EffectLists({ impact }: { readonly impact: DeleteImpact }) {
	return (
		<div className="grid gap-3 text-sm">
			<EffectGroup entries={impact.cascades} label="Also deleted" />
			<EffectGroup entries={impact.detaches} label="Kept, no longer linked" />
		</div>
	);
}

function EffectGroup({
	label,
	entries,
}: {
	readonly label: string;
	readonly entries: readonly DeleteImpactEntry[];
}) {
	if (entries.length === 0) {
		return null;
	}
	return (
		<div className="grid gap-1">
			<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				{label}
			</span>
			<ul className="m-0 grid list-none gap-0.5 p-0 text-foreground">
				{entries.map((entry) => (
					<li key={entry.key}>{impactCountLabel(entry)}</li>
				))}
			</ul>
		</div>
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
		<div className="grid gap-1 text-sm">
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
		<div className="grid gap-2">
			<Skeleton className="h-3.5 w-24" />
			<Skeleton className="h-3.5 w-48" />
		</div>
	);
}

function titleCase(noun: string): string {
	return noun.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}
