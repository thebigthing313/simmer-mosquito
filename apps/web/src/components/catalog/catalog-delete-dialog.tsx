import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { type ReactNode, useState } from 'react';
import {
	type DeletableRecordType,
	impactCountLabel,
	useDeleteImpact,
} from '../../hooks/use-delete-impact';

/**
 * The confirmation in front of a catalog delete.
 *
 * Deletion is rare and destructive, so unlike a lifecycle flip it always asks
 * first. `record` is what makes the asking honest: the dialog reads the
 * delete-impact endpoint and names what is still using the row, and the
 * destructive button is unavailable while anything is.
 *
 * Before that the copy claimed a server rule that did not exist, on a delete
 * that would have gone through and orphaned every record naming the row (#123).
 * Every catalog rule blocks, so `blockers` is the only list these ever fill and
 * the dialog has no cascade or detach case to render.
 *
 * The read is deliberately deferred until the dialog opens. A catalog page
 * renders one of these per row, and asking the server about every row on every
 * page load would be a request per row for a question nobody asked.
 */
export function CatalogDeleteDialog({
	trigger,
	title,
	description,
	confirmLabel,
	onConfirm,
	record,
}: {
	readonly trigger: ReactNode;
	readonly title: string;
	readonly description: ReactNode;
	/** The verb on the destructive button: "Delete", "Remove". */
	readonly confirmLabel: string;
	readonly onConfirm: () => void;
	/**
	 * The row being deleted, for the impact read. Omitted for a row that is not a
	 * catalog and has no delete policy of its own, such as one product inside a
	 * formulation.
	 */
	readonly record?: { readonly type: DeletableRecordType; readonly id: string } | undefined;
}) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<AlertDialog onOpenChange={setIsOpen} open={isOpen}>
			<AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{record === undefined ? (
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={onConfirm} variant="destructive">
							{confirmLabel}
						</AlertDialogAction>
					</AlertDialogFooter>
				) : (
					<CatalogDeleteBody
						confirmLabel={confirmLabel}
						isOpen={isOpen}
						onConfirm={onConfirm}
						record={record}
					/>
				)}
			</AlertDialogContent>
		</AlertDialog>
	);
}

/**
 * Separate so the impact query mounts with the dialog and unmounts with it.
 *
 * `isOpen` gates the hook rather than the render, because a hook cannot be
 * called conditionally and a closed dialog must not hold a live query.
 */
function CatalogDeleteBody({
	confirmLabel,
	isOpen,
	onConfirm,
	record,
}: {
	readonly confirmLabel: string;
	readonly isOpen: boolean;
	readonly onConfirm: () => void;
	readonly record: { readonly type: DeletableRecordType; readonly id: string };
}) {
	const { data: impact, isPending, isError } = useDeleteImpact(record.type, record.id, isOpen);
	const blockers = impact?.blockers ?? [];
	const isBlocked = blockers.length > 0;

	return (
		<>
			{isPending ? <Skeleton className="h-3 w-32" /> : null}
			{isBlocked ? (
				<div className="grid gap-1 text-xs">
					<span className="text-foreground">Still in use by:</span>
					<ul className="m-0 grid list-none gap-0.5 p-0 text-foreground">
						{blockers.map((entry) => (
							<li key={entry.key}>{impactCountLabel(entry)}</li>
						))}
					</ul>
					<span className="text-muted-foreground">
						Deactivate it instead, or remove these first.
					</span>
				</div>
			) : null}
			{isError ? (
				// The server checks again inside the delete transaction, so a failed
				// read costs the warning rather than the rule. Saying so beats
				// disabling the button over a dropped request.
				<p className="text-muted-foreground text-xs">
					Could not check what is using this. The server will still refuse the delete if something
					is.
				</p>
			) : null}
			<AlertDialogFooter>
				<AlertDialogCancel>Cancel</AlertDialogCancel>
				<AlertDialogAction
					disabled={isPending || isBlocked}
					onClick={onConfirm}
					variant="destructive"
				>
					{confirmLabel}
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	);
}
