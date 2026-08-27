import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';

/**
 * A stack of placeholder rows.
 *
 * `widths` is one Tailwind width class per row, and it is ragged on purpose: a
 * column of identical bars reads as a pattern, and an uneven one reads as text
 * that has not arrived yet. It is also why this takes a width list rather than a
 * count, since the ragging is the point.
 *
 * `rowClassName` carries the height and, where the surface needs it, the
 * placeholder colour. `Skeleton` fills with `bg-muted`, which is the right
 * neutral on `bg-background` and on `bg-card`, and the wrong one on two surfaces
 * this app has: the green rail, where it is a pale block on a dark field, and
 * the secondary sidebar, whose `bg-sidebar` resolves to the same paper as
 * `bg-muted` and swallows it. Both pass their own fill.
 */
export function SkeletonRows({
	className,
	rowClassName,
	widths,
}: {
	/** Applied to the wrapping grid. */
	readonly className?: string | undefined;
	/** Applied to every row, after `Skeleton`'s own classes. */
	readonly rowClassName?: string | undefined;
	readonly widths: readonly string[];
}) {
	return (
		<div className={cn('grid gap-2', className)}>
			{widths.map((width, index) => (
				<Skeleton
					className={cn(rowClassName, width)}
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder list with no identity
					key={index}
				/>
			))}
		</div>
	);
}
