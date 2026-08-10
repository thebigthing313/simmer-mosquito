import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from '@simmer-mosquito/ui-web/components/ui/drawer';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';

const CloseIcon = iconRegistry.actions.close.icon;

/**
 * Tailwind scans class strings literally, so the widths a drawer may take are
 * named here rather than interpolated from a number at the call site.
 */
const DRAWER_WIDTHS = {
	md: 'w-[min(560px,100%)] overflow-hidden sm:max-w-[560px]',
	lg: 'w-[min(640px,100%)] overflow-hidden sm:max-w-[640px]',
	xl: 'w-[min(720px,100%)] overflow-hidden sm:max-w-[720px]',
} as const;

/**
 * The side drawer a catalog record with more than a handful of fields is written
 * in — the dialog's counterpart for the catalogs whose rows expand.
 *
 * Like {@link CatalogRecordDialog} it owns no form: mount it inside the page's
 * `form.AppForm` and the field and action nodes handed to it resolve their
 * context normally.
 *
 * The open state stays with the caller because the form's submit closes it, and
 * `onOpenChange` is where the form is reset — a drawer opened from a row keeps
 * its form instance across every row it edits.
 */
export function CatalogRecordDrawer({
	title,
	description,
	open,
	onOpenChange,
	trigger,
	tooltip,
	width,
	onSubmit,
	actions,
	destructiveAction,
	children,
}: {
	readonly title: string;
	readonly description: string;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly trigger: ReactNode;
	/** When set, the trigger gets a hover/focus tooltip with this label. */
	readonly tooltip?: string | undefined;
	readonly width: keyof typeof DRAWER_WIDTHS;
	/** Called on submit; this owns `preventDefault`. */
	readonly onSubmit: () => void;
	/** Submit and cancel. */
	readonly actions: ReactNode;
	/** Delete, if this record has one. Sits apart from the actions, at the far left. */
	readonly destructiveAction?: ReactNode | undefined;
	readonly children: ReactNode;
}) {
	return (
		<Drawer direction="right" onOpenChange={onOpenChange} open={open}>
			{tooltip === undefined ? (
				<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			) : (
				<Tooltip>
					<TooltipTrigger asChild>
						<DrawerTrigger asChild>{trigger}</DrawerTrigger>
					</TooltipTrigger>
					<TooltipContent>{tooltip}</TooltipContent>
				</Tooltip>
			)}
			<DrawerContent className={DRAWER_WIDTHS[width]}>
				<DrawerHeader className={stickyHeader({ padding: 'none' })}>
					<DrawerTitle>{title}</DrawerTitle>
					<DrawerDescription>{description}</DrawerDescription>
				</DrawerHeader>
				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={(event) => {
						event.preventDefault();
						onSubmit();
					}}
				>
					<div className="grid min-h-0 gap-3.5 overflow-y-auto px-4 py-3.5">{children}</div>
					<DrawerFooter>
						{destructiveAction === undefined ? (
							actions
						) : (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<div className="mr-auto">{destructiveAction}</div>
								{actions}
							</div>
						)}
					</DrawerFooter>
				</form>
			</DrawerContent>
		</Drawer>
	);
}

/** Dismiss without saving. */
export function CatalogDrawerCancel() {
	return (
		<DrawerClose asChild>
			<Button type="button" variant="outline">
				<CloseIcon aria-hidden="true" data-icon="inline-start" />
				Cancel
			</Button>
		</DrawerClose>
	);
}
