import { cn } from '@simmer-mosquito/ui-web/lib/utils';

/**
 * Diverges from the shadcn default `bg-accent`: `--accent` is the SIMMER brand
 * yellow, so an accent-filled skeleton reads as attention rather than as an
 * absent surface. `--muted` is the neutral placeholder surface.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="skeleton"
			className={cn('animate-pulse rounded-md bg-muted', className)}
			{...props}
		/>
	);
}

export { Skeleton };
