import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { CheckIcon, SearchIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { type Collection, eq, useLiveQuery } from '@tanstack/react-db';

// Shared search-and-pick chrome for the domain forms: a search input that opens a
// popover of matches beneath itself. Callers supply the results — an eager
// collection filtered client-side, or a live subset query against an on-demand one.

const selectedGcTimeMs = 30_000;
/** A syntactically valid uuid no row carries, so "nothing selected" matches nothing. */
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/** What every synced row carries, and all this lookup needs. */
interface IdentifiedRow {
	readonly [key: string]: unknown;
	readonly id: string;
}

/**
 * The label a picker shows for its current selection: what the user just picked,
 * else the row read back by id — an edit form arrives holding only the id — else
 * empty while that row is still streaming in.
 */
export function useSelectedRowLabel<TRow extends IdentifiedRow>({
	collection,
	value,
	pickedLabel,
	toLabel,
}: {
	readonly collection: Collection<TRow, string | number>;
	readonly value: string | null;
	readonly pickedLabel: string;
	readonly toLabel: (row: TRow) => string;
}): string {
	const queryId = value ?? UNMATCHABLE_ID;
	// The query builder resolves column refs off a concrete row type, so the lookup
	// runs against the shared `id` shape every synced row satisfies.
	const rows = collection as unknown as Collection<IdentifiedRow, string | number>;
	const { data } = useLiveQuery(
		{
			gcTime: selectedGcTimeMs,
			// No `limit` — an id equality already yields at most one row, and the query
			// compiler rejects LIMIT without an ORDER BY.
			query: (query) => query.from({ row: rows }).where(({ row }) => eq(row.id, queryId)),
		},
		[queryId],
	);

	if (value === null) {
		return '';
	}
	if (pickedLabel.length > 0) {
		return pickedLabel;
	}
	const [selected] = (data ?? []) as unknown as readonly TRow[];
	return selected === undefined ? '' : toLabel(selected);
}

export function PickerFrame({
	label,
	value,
	open,
	search,
	selectedLabel,
	placeholder,
	anchorRef,
	onSearchChange,
	onOpen,
	onClear,
	onOpenChange,
	children,
}: {
	readonly label: string;
	readonly value: string | null;
	readonly open: boolean;
	readonly search: string;
	readonly selectedLabel: string;
	readonly placeholder: string;
	readonly anchorRef: React.RefObject<HTMLDivElement | null>;
	readonly onSearchChange: (value: string) => void;
	readonly onOpen: () => void;
	readonly onClear: () => void;
	readonly onOpenChange: (open: boolean) => void;
	readonly children: React.ReactNode;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">{label}</span>
			<Popover onOpenChange={onOpenChange} open={open}>
				<PopoverAnchor asChild>
					<div className="relative" ref={anchorRef}>
						<SearchIcon
							aria-hidden="true"
							className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
						/>
						<Input
							className="pr-10 pl-9"
							onChange={(event) => onSearchChange(event.target.value)}
							onFocus={onOpen}
							placeholder={placeholder}
							value={open ? search : selectedLabel}
						/>
						{value === null ? null : (
							<Button
								aria-label={`Clear ${label.toLowerCase()}`}
								className="-translate-y-1/2 absolute top-1/2 right-1.5"
								onClick={onClear}
								size="icon-xs"
								type="button"
								variant="ghost"
							>
								<XIcon aria-hidden="true" />
							</Button>
						)}
					</div>
				</PopoverAnchor>
				<PopoverContent
					align="start"
					className="grid w-(--radix-popover-trigger-width) min-w-80 gap-2 p-2"
					onInteractOutside={(event) => {
						const target = event.detail.originalEvent.target as Node | null;
						if (target !== null && anchorRef.current?.contains(target)) {
							event.preventDefault();
						}
					}}
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					{children}
				</PopoverContent>
			</Popover>
		</div>
	);
}

export function OptionRow({
	primary,
	secondary,
	selected,
	onSelect,
}: {
	readonly primary: string;
	readonly secondary?: string | null;
	readonly selected: boolean;
	readonly onSelect: () => void;
}) {
	return (
		<button
			className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
			onClick={onSelect}
			type="button"
		>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium">{primary}</span>
				{secondary === undefined || secondary === null || secondary.length === 0 ? null : (
					<span className="block truncate text-muted-foreground text-xs">{secondary}</span>
				)}
			</span>
			{selected ? <CheckIcon aria-hidden="true" /> : null}
		</button>
	);
}

export function PickerFallback({ label }: { readonly label: string }) {
	return (
		<div className="flex min-h-16 items-center justify-center gap-2 rounded-md bg-muted/50 text-muted-foreground text-sm">
			<SearchIcon aria-hidden="true" />
			{label}
		</div>
	);
}
