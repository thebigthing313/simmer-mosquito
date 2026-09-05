import { ListLoading, ListNoMatches } from '@simmer-mosquito/ui-web/components/page';
import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
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
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { type FormEvent, type ReactNode, useState } from 'react';

/**
 * The chrome the three global catalogs share.
 *
 * Genera, species, and units are the same interaction three times: scan a list
 * of short records, add one, edit one in place, delete one behind a
 * confirmation. Writing that per page is how the delete confirmations ended up
 * disagreeing about whether they named what was being deleted.
 *
 * Creating happens in the same dialog as editing, opened from the page header —
 * the shape `apps/web`'s catalog pages already use. A permanent create form
 * pinned above the data is a worse trade: it costs vertical space on every
 * visit to serve the rarest action, and it makes "add" and "edit" two different
 * experiences of one operation.
 */

const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

/** Below this the filter is noise — you can see the whole list already. */
const SEARCH_THRESHOLD = 6;

export function CatalogRow({
	title,
	subtitle,
	badges,
	actions,
}: {
	readonly title: string;
	readonly subtitle?: string | null | undefined;
	readonly badges?: ReactNode | undefined;
	/** Omitted on read-only lists — the organization foundations are create-only. */
	readonly actions?: ReactNode | undefined;
}) {
	return (
		<li className="group flex items-center gap-3 bg-card px-4 py-2.5 transition-colors hover:bg-muted/40">
			<div className="min-w-0 flex-1">
				<p className="m-0 truncate font-medium text-foreground text-sm">{title}</p>
				{subtitle === null || subtitle === undefined || subtitle === '' ? null : (
					<p className="mt-0.5 mb-0 truncate text-muted-foreground text-xs">{subtitle}</p>
				)}
			</div>
			{badges === undefined ? null : (
				<div className="flex shrink-0 items-center gap-1.5">{badges}</div>
			)}
			{/*
			 * Row actions stay dim until the row is hovered or something inside it
			 * takes focus, so a long list reads as data rather than as a column of
			 * buttons. They never disappear: `focus-within` keeps them reachable by
			 * keyboard, and they hold their space so the row does not shift.
			 */}
			{actions === undefined ? null : (
				<div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
					{actions}
				</div>
			)}
		</li>
	);
}

/** The bordered list a catalog's rows sit in. */
export function CatalogList({ children }: { readonly children: ReactNode }) {
	return (
		<ul className="m-0 grid list-none gap-px overflow-hidden rounded-md border border-border/50 bg-border/50 p-0">
			{children}
		</ul>
	);
}

/**
 * Counts on the left, filter on the right.
 *
 * The filter only appears once the list is long enough to need one — the same
 * threshold the organization workspace uses. A search box above five rows is
 * chrome pretending to be a feature.
 */
function CatalogToolbar({
	total,
	shown,
	noun,
	search,
	onSearchChange,
}: {
	readonly total: number;
	readonly shown: number;
	/** Plural, lowercase: "genera", "species", "units". */
	readonly noun: string;
	readonly search: string;
	readonly onSearchChange: (next: string) => void;
}) {
	if (total <= SEARCH_THRESHOLD) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<Badge tone="neutral" variant="outline">
				{search.trim() === '' ? `${total} ${noun}` : `${shown} of ${total} ${noun}`}
			</Badge>
			<SearchInput
				aria-label={`Search ${noun}`}
				className="h-9 w-full max-w-[260px]"
				onChange={(event) => onSearchChange(event.target.value)}
				placeholder={`Search ${noun}…`}
				value={search}
			/>
		</div>
	);
}

/**
 * The four states every list surface in the console moves through: waiting,
 * nothing yet, nothing matching, and the rows.
 *
 * Each page wrote its own chain of these, which is four chances to disagree
 * about whether an empty search result should look like an empty catalog (it
 * should not — one means "add something", the other means "type less") and four
 * route components carrying render branching on top of their data and their
 * writes. Owning the sequence here keeps each page to the part that differs: its
 * query, its rows, and its copy.
 */
export function CatalogBody({
	isReady,
	total,
	shown,
	noun,
	search,
	onSearchChange,
	empty,
	banner,
	children,
}: {
	readonly isReady: boolean;
	/** Rows before filtering — decides empty-catalog vs no-matches. */
	readonly total: number;
	readonly shown: number;
	/** Plural, lowercase: "genera", "units", "organizations". */
	readonly noun: string;
	readonly search: string;
	readonly onSearchChange: (next: string) => void;
	readonly empty: ReactNode;
	/** Rendered above the toolbar once there is data — a standing condition. */
	readonly banner?: ReactNode | undefined;
	readonly children: ReactNode;
}) {
	if (!isReady) {
		return <ListLoading />;
	}

	if (total === 0) {
		return <>{empty}</>;
	}

	return (
		<div className="grid gap-4">
			{banner}
			<CatalogToolbar
				noun={noun}
				onSearchChange={onSearchChange}
				search={search}
				shown={shown}
				total={total}
			/>
			{shown === 0 ? <ListNoMatches noun={noun} query={search.trim()} /> : children}
		</div>
	);
}

export function EditRecordButton({
	label,
	onClick,
}: {
	/** Names the record, so the control is distinguishable in a long list. */
	readonly label: string;
	readonly onClick: () => void;
}) {
	return (
		<Button aria-label={label} onClick={onClick} size="icon-sm" title={label} variant="ghost">
			<EditIcon aria-hidden="true" />
		</Button>
	);
}

/**
 * Delete, behind a confirmation that names the record.
 *
 * These are global reference rows every organization reads, so a deletion is
 * not a local mistake — it is one an operator makes on everyone's behalf. The
 * dialog therefore states what will be removed rather than asking "are you
 * sure?".
 */
export function DeleteRecordButton({
	recordLabel,
	consequence,
	onDelete,
}: {
	readonly recordLabel: string;
	/** One sentence on what depends on this record. */
	readonly consequence: string;
	readonly onDelete: () => void;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					aria-label={`Delete ${recordLabel}`}
					size="icon-sm"
					title={`Delete ${recordLabel}`}
					variant="ghost"
				>
					<DeleteIcon aria-hidden="true" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete {recordLabel}?</AlertDialogTitle>
					<AlertDialogDescription>{consequence}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onDelete} variant="destructive">
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/**
 * What a catalog page's dialog is showing: nothing, a create, or a row's edit.
 *
 * One value rather than an `isOpen` flag beside an `editing` row, because those
 * two can disagree and this cannot.
 */
export type CatalogDialogState<TRow> = TRow | 'new' | null;

/**
 * The create-or-edit dialog every catalog page opens.
 *
 * Each page had the same five ternaries — title, description, submit label,
 * initial values, and which write to call — spelled out against `'new'`. That is
 * the branching the complexity gate was pointing at, and it is identical every
 * time: only the copy and the form differ. Both are parameters now.
 */
export function CatalogDialog<TRow>({
	state,
	onClose,
	createTitle,
	createDescription,
	editTitle,
	editDescription,
	children,
}: {
	readonly state: CatalogDialogState<TRow>;
	readonly onClose: () => void;
	readonly createTitle: string;
	readonly createDescription: string;
	readonly editTitle: (row: TRow) => string;
	readonly editDescription: string;
	/** `row` is null when creating. `submitLabel` matches the mode. */
	readonly children: (args: {
		readonly row: TRow | null;
		readonly submitLabel: string;
	}) => ReactNode;
}) {
	const row = state === 'new' || state === null ? null : state;

	return (
		<RecordDialog
			description={row === null ? createDescription : editDescription}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open={state !== null}
			title={row === null ? createTitle : editTitle(row)}
		>
			{state === null ? null : children({ row, submitLabel: row === null ? createTitle : 'Save' })}
		</RecordDialog>
	);
}

/** The dialog a catalog create or edit opens into. Its body is the caller's form. */
export function RecordDialog({
	title,
	description,
	open,
	onOpenChange,
	children,
}: {
	readonly title: string;
	readonly description: string;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly children: ReactNode;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{children}
			</DialogContent>
		</Dialog>
	);
}

/**
 * The submit scaffold every catalog form repeats: draft values, a pending flag,
 * and an inline error.
 *
 * Every catalog form now lives in a dialog, so there is no reset-after-save
 * branch: the dialog closes, and the next open mounts a fresh form.
 */
export function useCatalogForm<TValues>({
	initial,
	onSubmit,
}: {
	readonly initial: TValues;
	readonly onSubmit: (values: TValues) => Promise<void>;
}): {
	readonly values: TValues;
	readonly setValues: (next: TValues) => void;
	readonly pending: boolean;
	readonly error: string | null;
	readonly submit: (event: FormEvent<HTMLFormElement>) => void;
} {
	const [values, setValues] = useState(initial);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function run() {
		setPending(true);
		setError(null);
		try {
			await onSubmit(values);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : 'Unable to save.');
		} finally {
			setPending(false);
		}
	}

	return {
		values,
		setValues,
		pending,
		error,
		submit: (event) => {
			event.preventDefault();
			if (!pending) {
				void run();
			}
		},
	};
}

/** The shared body of a catalog form: fields, an error line, and the submit row. */
export function CatalogForm({
	error,
	pending,
	submitLabel,
	disabled,
	onCancel,
	onSubmit,
	children,
}: {
	readonly error: string | null;
	readonly pending: boolean;
	readonly submitLabel: string;
	readonly disabled: boolean;
	readonly onCancel: () => void;
	readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	readonly children: ReactNode;
}) {
	return (
		<form className="grid gap-4" onSubmit={onSubmit}>
			{children}
			{error === null ? null : (
				<p className="m-0 text-destructive text-sm" role="alert">
					{error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button onClick={onCancel} type="button" variant="outline">
					Cancel
				</Button>
				<Button disabled={pending || disabled} type="submit">
					{pending ? 'Saving…' : submitLabel}
				</Button>
			</div>
		</form>
	);
}
