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
import type { ReactNode } from 'react';

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
