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
import type { ReactNode } from 'react';

/**
 * The confirmation in front of a catalog delete.
 *
 * Deletion is rare and destructive, so unlike a lifecycle flip it always asks
 * first, and the description says what survives it — the applications already
 * recorded from a mix keep their own product and amount, and a delete the server
 * refuses leaves the record in place.
 */
export function CatalogDeleteDialog({
	trigger,
	title,
	description,
	confirmLabel,
	onConfirm,
}: {
	readonly trigger: ReactNode;
	readonly title: string;
	readonly description: ReactNode;
	/** The verb on the destructive button: "Delete", "Remove". */
	readonly confirmLabel: string;
	readonly onConfirm: () => void;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
