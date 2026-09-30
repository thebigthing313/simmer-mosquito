/**
 * The count beside a tab label or a section heading, and nothing at zero.
 *
 * The worklist's Stops tab, the service request page's nearby tabs, both
 * Comments tabs and the thread's own heading draw it.
 */
export function LabelCount({ count }: { readonly count: number }) {
	return count === 0 ? null : (
		<span className="text-muted-foreground text-xs tabular-nums">{count}</span>
	);
}
