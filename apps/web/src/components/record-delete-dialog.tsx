import { settleWrite } from '@simmer-mosquito/sync';
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
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { type LinkProps, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Acknowledgements, AskAcknowledged } from '../hooks/use-acknowledged-write';
import {
	type DeletableRecordType,
	type DeleteImpact,
	type DeleteImpactEntry,
	deleteImpactQueryKey,
	impactCountLabel,
	useDeleteImpact,
} from '../hooks/use-delete-impact';
import { type RecordType, recordNoun } from '../lib/record-nouns';
import { errorMessageForSave } from '../lib/save-error';
import type { MinimumRole } from '../lib/write-access';
import { readBlockers } from '../sync/command-error';

/**
 * The role each delete needs, from `apps/server/src/command-permissions.ts`.
 *
 * Derived from `recordType` rather than taken as a prop, because a prop is
 * something a caller can get wrong and this is the app's one delete surface. A
 * record a collector may create is one they may remove; the rest are
 * supervisory, and the control actions are manager-only in code pending #63.
 */
export const DELETE_FLOOR: Record<DeletableRecordType, MinimumRole> = {
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
	notificationRegistration: 'manager',

	// The catalogs, from the same file. They have no detail page and reach their
	// delete through `CatalogDeleteDialog` inside an edit drawer, so nothing
	// passes them here. The map claims to cover every deletable type, though, so
	// a missing member is the drift rather than a shorter list.
	collectionMethod: 'admin',
	collectionLure: 'admin',
	habitatType: 'admin',
	applicationMethod: 'admin',
	sourceReductionMethod: 'admin',
	outreachMethod: 'admin',
	biocontrolMethod: 'admin',
	insecticide: 'admin',
	formulation: 'admin',
	notificationType: 'admin',

	vehicle: 'manager',
	equipment: 'manager',
	insecticideBatch: 'manager',
	tag: 'manager',
};

export interface RecordDeleteTarget {
	/**
	 * The server-side record kind, which decides the delete policy, and the key
	 * this dialog's copy reads its noun under.
	 *
	 * Narrowed to the record types that are in both unions rather than to either
	 * one. The endpoint's union carries the catalogs, which delete inline and
	 * never open this dialog, and the noun register carries a weather station,
	 * which has no delete policy. What is left is the records with a page and a
	 * delete, and a dialog that could be drawn for neither half fails `tsc`
	 * rather than asking the endpoint about a record kind it has never heard of.
	 */
	readonly recordType: Extract<DeletableRecordType, RecordType>;
	readonly recordId: string;
	/** What to call this particular record in the confirmation. */
	readonly name: string;
	/**
	 * Removes the record.
	 *
	 * Two shapes while the write seam is being migrated. A caller on
	 * `hooks/mutations` returns the promise its hook already settled; one still on
	 * `webCollections.x.delete(id)` returns the raw transaction, and this settles
	 * it. Both are awaited the same way, see {@link settleDeletion}.
	 */
	readonly onDelete: (
		acknowledgements: Acknowledgements,
	) => Promise<unknown> | { readonly isPersisted: { readonly promise: Promise<unknown> } };
	/**
	 * Runs the delete so a refusal a confirmation can answer becomes a question.
	 *
	 * The delete registry refuses a delete that would unlink or remove rows the
	 * caller has not agreed to lose, and only a client that sends the flag as
	 * `false` ever hears about it. A caller opts in by passing `run` from
	 * `useAcknowledgedWrite` here, along with an `onDelete` that reads the flags.
	 * Absent, the delete goes out with no flags and the server treats every one
	 * as confirmed, which is what all of them did before #319.
	 *
	 * **Hold the hook above whatever unmounts.** The delete is optimistic, so the
	 * record leaves its collection the moment the button is pressed and the page
	 * describing it unmounts before the refusal arrives. On a detail page that is
	 * `RecordDetailPage`, which takes the refusal map as `deleteRefusals` and
	 * hands the runner down; it is what renders `RecordUnavailable` in the
	 * record's place.
	 */
	readonly ask?: AskAcknowledged | undefined;
}

/**
 * Where the reader goes once the record is gone.
 *
 * A record with a page of its own leaves a page that no longer has anything to
 * show, so this navigates: `returnTo` is the list it came from. A record edited
 * inside a panel has no page to leave, and a notification registration is the
 * case: it is created, edited and deleted in the panel beside the map on its
 * contact's registrations page. `onDeleted` closes that panel instead.
 *
 * One or the other, never both and never neither: a delete with no destination
 * leaves the reader looking at a record that has just stopped existing.
 */
export type RecordDeleteDestination =
	| { readonly returnTo: NonNullable<LinkProps['to']>; readonly onDeleted?: never }
	| { readonly returnTo?: never; readonly onDeleted: () => void };

export type RecordDeleteProps = RecordDeleteTarget & RecordDeleteDestination;

/**
 * Await a deletion, whichever half of the migration it came from.
 *
 * A transaction is recognised by the one thing it has that a promise does not.
 * Once every caller deletes through `hooks/mutations` this collapses back to
 * awaiting the promise.
 */
function settleDeletion(
	result: Promise<unknown> | { readonly isPersisted: { readonly promise: Promise<unknown> } },
): Promise<unknown> {
	return 'isPersisted' in result ? settleWrite(result) : result;
}

/**
 * The last screen before a record is removed, and the whole of what the reader
 * gets to decide on.
 *
 * Everything in it comes from the server's delete policy rather than from the
 * caller: which records go with this one, which survive with their link
 * cleared, and whether the delete is refused at all. A caller only says which
 * record it is and where to go afterwards, so the warning cannot fall out of
 * step with what the command actually does.
 *
 * ## Why the refusal is in here too
 *
 * A blocked delete used to be reported on the page, on a card that disabled its
 * own button and listed what still referenced the record. With the delete on a
 * menu there is nowhere on the page to say that, and a disabled menu item says
 * nothing at all, so the dialog opens either way and reports the refusal in the
 * place the reader has just asked the question. The confirm button is what
 * turns off.
 *
 * ## The impact read waits for the dialog
 *
 * `useDeleteImpact` is gated on `open`. The card used to mount on every detail
 * page, so every visit to a record spent a request on a question almost nobody
 * asked. It is asked when somebody opens the dialog now, which is also when the
 * answer is fresh enough to act on.
 */
export function RecordDeleteDialog({
	recordType,
	recordId,
	name,
	onDelete,
	onDeleted,
	returnTo,
	ask,
	onOpenChange,
	open,
}: RecordDeleteProps & {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const { one, title } = recordNoun(recordType);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const impactQuery = useDeleteImpact(recordType, recordId, open);
	const [isDeleting, setIsDeleting] = useState(false);
	const [refusedBlockers, setRefusedBlockers] = useState<readonly DeleteImpactEntry[]>([]);

	const impact = impactQuery.data;
	// The impact read is what normally knows, and it turns off the confirm up
	// front. `refusedBlockers` is the race: a reference landed while the page was
	// open, and the 409 that refused the delete carries what it was.
	const blockers = refusedBlockers.length > 0 ? refusedBlockers : (impact?.blockers ?? []);
	const isBlocked = blockers.length > 0;

	const confirmDelete = async () => {
		onOpenChange(false);
		setIsDeleting(true);
		try {
			const remove = async (acknowledgements: Acknowledgements) => {
				await settleDeletion(onDelete(acknowledgements));
				if (returnTo === undefined) {
					// The props union makes this the panel case, where `onDeleted` is
					// required. The optional call is what the destructured union costs:
					// narrowing on `returnTo` does not carry to its sibling.
					onDeleted?.();
					return;
				}
				await navigate({ to: returnTo });
			};
			// Leaving the page is inside the write on purpose: `ask` resolves on a
			// refusal as well as on a success, so navigating after it would abandon
			// the page before the question could be asked.
			if (ask === undefined) {
				await remove({});
			} else {
				await ask(remove);
			}
		} catch (cause) {
			const blocked = readBlockers(cause);
			const message =
				blocked.length > 0
					? `Deleting this ${one} is blocked by ${impactCountLabel(blocked[0] as DeleteImpactEntry)}.`
					: errorMessageForSave(cause, `Unable to delete the ${one}.`);

			// The delete is optimistic, so the row leaves the collection the moment
			// the button is pressed and this unmounts with the record it was
			// describing. By the time a refusal comes back there is nothing here to
			// set state on, hence the toast, which lives above the route in the app
			// shell and outlasts the rollback that puts the page back.
			toast.error(message);
			// The 409 already said what stopped it, so render that rather than
			// waiting on a second read to say the same thing. The invalidation below
			// still runs; this is what fills the gap until it lands.
			setRefusedBlockers(blocked);

			// A delete refused mid-flight means something started referencing this
			// record while the page was open. Invalidate rather than refetch: this
			// goes through the cache, so it still lands when the dialog is gone, and
			// a reopened dialog reads the blockers instead of a stale all-clear.
			void queryClient.invalidateQueries({
				queryKey: deleteImpactQueryKey(recordType, recordId),
			});
			setIsDeleting(false);
		}
	};

	const reading: ImpactReading = {
		blockers,
		impact,
		isBlocked,
		isError: impactQuery.isError,
		isPending: impactQuery.isPending,
	};

	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{isBlocked ? `Can't delete ${name}` : `Delete ${name}?`}
					</AlertDialogTitle>
					<AlertDialogDescription>{describeDelete(reading, one)}</AlertDialogDescription>
				</AlertDialogHeader>
				<ImpactBody reading={reading} />
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={isBlocked || isDeleting || impactQuery.isPending}
						onClick={confirmDelete}
						variant="destructive"
					>
						Delete {title}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/** What the impact read has to say, as the dialog's two halves both read it. */
interface ImpactReading {
	readonly isPending: boolean;
	readonly isError: boolean;
	readonly isBlocked: boolean;
	readonly blockers: readonly DeleteImpactEntry[];
	readonly impact: DeleteImpact | undefined;
}

/**
 * The sentence under the title.
 *
 * In order of what the reader needs: whether the delete is refused at all, then
 * whether we know what it would touch, then whether it touches anything. The
 * last case says only "This can't be undone", because the lists below it are
 * about to say the rest.
 */
function describeDelete(reading: ImpactReading, noun: string): string {
	if (reading.isBlocked) {
		return `Remove what still references this ${noun} before deleting it.`;
	}
	if (reading.isError) {
		return `Could not check what deleting this ${noun} would affect. This can't be undone.`;
	}
	if (reading.impact === undefined || !hasEffects(reading.impact)) {
		return `This ${noun} will be removed. This can't be undone.`;
	}
	return "This can't be undone.";
}

/** What deleting this reaches, or what is stopping it. */
function ImpactBody({ reading }: { readonly reading: ImpactReading }) {
	if (reading.isBlocked) {
		return <EffectGroup entries={reading.blockers} label="Still in use by" />;
	}
	if (reading.isPending) {
		return <ImpactSkeleton />;
	}
	if (reading.impact === undefined || !hasEffects(reading.impact)) {
		return null;
	}
	return <EffectLists impact={reading.impact} />;
}

/** True when deleting this record would reach past the record itself. */
function hasEffects(impact: DeleteImpact): boolean {
	return impact.cascades.length > 0 || impact.detaches.length > 0;
}

/** What goes and what stays. */
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
			<ul className="m-0 grid list-none gap-0.5 p-0 text-foreground text-sm">
				{entries.map((entry) => (
					<li key={entry.key}>{impactCountLabel(entry)}</li>
				))}
			</ul>
		</div>
	);
}

function ImpactSkeleton() {
	return (
		<div className="grid gap-1.5">
			<Skeleton className="h-3 w-24" />
			<Skeleton className="h-3 w-48" />
		</div>
	);
}
