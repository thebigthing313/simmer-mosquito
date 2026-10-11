import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';

/**
 * Where a stop stands against the map beside its list, and the two callbacks
 * that move it: `onSelect` takes the stop's id, or `null` to clear the
 * selection, and `onHover` takes the id on enter and `null` on leave.
 */
export interface StopFocus {
	readonly selected: boolean;
	readonly highlighted: boolean;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}

/**
 * The card around one stop on a list that sits beside a map: an `<li>` whose
 * border rings when the stop is selected or highlighted, a full-card button
 * that selects the stop and clears it on a second press, and a body that
 * ignores the pointer so the button underneath takes the click. A link or
 * control inside `children` opts back in with `pointer-events-auto`.
 *
 * Takes the stop's `id`, the select button's accessible `label`, the stop's
 * `focus`, and the body as `children`.
 */
export function StopCardFrame({
	id,
	label,
	focus,
	children,
}: {
	readonly id: string;
	readonly label: string;
	readonly focus: StopFocus;
	readonly children: ReactNode;
}) {
	const { selected, highlighted, onSelect, onHover } = focus;

	return (
		<li
			className={cn(
				'relative rounded-lg border bg-card transition-colors',
				selected || highlighted ? 'border-primary/40 ring-1 ring-primary/25' : 'border-border/60',
			)}
			onMouseEnter={() => onHover(id)}
			onMouseLeave={() => onHover(null)}
		>
			<button
				aria-label={label}
				aria-pressed={selected}
				className={cn(
					'absolute inset-0 size-full rounded-lg transition-colors',
					selected ? 'bg-primary/5' : 'hover:bg-muted/40',
				)}
				onClick={() => onSelect(selected ? null : id)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-start gap-3 p-3">{children}</div>
		</li>
	);
}
