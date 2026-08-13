import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { SearchIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';

/**
 * The search box above a list: a leading magnifier, and a clear button that
 * appears once there is something to clear.
 *
 * This existed four times — the traps explorer, the habitats explorer, the route
 * planner, and the trap directory — as the same thirty lines with a different
 * `placeholder` and `aria-label`. The copies had already started to drift in the
 * only way that matters: three of them clear by calling `onChange('')`, which is
 * wrong for a debounced field, where the pending commit has to be cancelled as
 * well as the input emptied. That is what `onClear` is for.
 *
 * The clear control is a plain button rather than `type="search"`'s native
 * affordance, which Firefox does not draw at all and Safari draws differently.
 */
export function SearchField({
	value,
	onChange,
	onClear,
	label,
	placeholder,
	className,
}: {
	readonly value: string;
	readonly onChange: (value: string) => void;
	/**
	 * Clearing, when it means more than emptying the input — a debounced field
	 * also has a queued commit to drop. Defaults to `onChange('')`.
	 */
	readonly onClear?: (() => void) | undefined;
	/** The accessible name. Says what is searched and by what, e.g. "Search traps by name or code". */
	readonly label: string;
	readonly placeholder: string;
	/** Placement only — where this field sits in its parent. */
	readonly className?: string | undefined;
}) {
	return (
		<div className={cn('relative', className)}>
			<SearchIcon
				aria-hidden="true"
				className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
			/>
			<Input
				aria-label={label}
				className="pl-9"
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				type="search"
				value={value}
			/>
			{value.length > 0 ? (
				<button
					aria-label="Clear search"
					className="-translate-y-1/2 absolute top-1/2 right-2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={onClear ?? (() => onChange(''))}
					type="button"
				>
					<XIcon aria-hidden="true" className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}
