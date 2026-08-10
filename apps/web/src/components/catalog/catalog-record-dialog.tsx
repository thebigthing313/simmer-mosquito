import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { type ReactNode, useEffect, useRef, useState } from 'react';

const CloseIcon = iconRegistry.actions.close.icon;

/**
 * The create-or-edit dialog a catalog record is written in: header, the fields
 * in the only scrolling region, and the actions pinned below them.
 *
 * The form itself stays in the page — the fields are what each catalog is *for*
 * — so this owns no `useAppForm`. Mount it inside the page's own `form.AppForm`
 * and the field and action nodes handed to it resolve their context normally.
 */
export function CatalogRecordDialog({
	title,
	description,
	open,
	onOpenChange,
	trigger,
	onSubmit,
	actions,
	children,
}: {
	readonly title: string;
	readonly description: string;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	/** Uncontrolled mode: the element that opens the dialog. Omit for a row menu's edit. */
	readonly trigger?: ReactNode | undefined;
	/** Called on submit; this owns `preventDefault`. */
	readonly onSubmit: () => void;
	/** The footer's contents — submit, cancel, and any destructive action. */
	readonly actions: ReactNode;
	readonly children: ReactNode;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			{trigger === undefined ? null : <DialogTrigger asChild>{trigger}</DialogTrigger>}
			<DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
				<DialogHeader className="border-border/60 border-b px-6 py-4 pr-10 text-left">
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={(event) => {
						event.preventDefault();
						onSubmit();
					}}
				>
					<div className="grid min-h-0 flex-1 gap-3.5 overflow-y-auto px-6 py-4">{children}</div>
					<DialogFooter className="border-border/60 border-t px-6 py-4">{actions}</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** Dismiss without saving. */
export function CatalogDialogCancel() {
	return (
		<DialogClose asChild>
			<Button type="button" variant="outline">
				<CloseIcon aria-hidden="true" data-icon="inline-start" />
				Cancel
			</Button>
		</DialogClose>
	);
}

/**
 * The open state of a record dialog that serves two callers: its own Add trigger
 * and a row menu's Edit.
 *
 * Pass the controlled pair through and it defers to them; pass neither and it
 * keeps the state itself. Either way the page reads one `open` and calls one
 * `setOpen(false)` when a save succeeds.
 */
export function useCatalogDialogOpen(
	controlledOpen: boolean | undefined,
	onOpenChange: ((open: boolean) => void) | undefined,
): readonly [boolean, (next: boolean) => void] {
	const [internalOpen, setInternalOpen] = useState(false);
	const isControlled = controlledOpen !== undefined;

	function setOpen(next: boolean) {
		if (isControlled) {
			onOpenChange?.(next);
		} else {
			setInternalOpen(next);
		}
	}

	return [isControlled ? controlledOpen : internalOpen, setOpen];
}

/**
 * Refill a record dialog's form whenever it opens, and whenever the row behind
 * it changes while it is open.
 *
 * Opening is the only moment the defaults are right: a dialog mounted by a row
 * menu keeps its form instance across every row it edits.
 */
export function useResetOnOpen(open: boolean, record: unknown, reset: () => void): void {
	const latest = useRef(reset);
	latest.current = reset;

	// biome-ignore lint/correctness/useExhaustiveDependencies: `record` is the trigger, not a read — a row that changes under an open dialog refills it.
	useEffect(() => {
		if (open) {
			latest.current();
		}
	}, [open, record]);
}
