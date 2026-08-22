import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';

/**
 * A full-bleed content layout for map-first routes. Where {@link OutletSimpleLayout}
 * centers a padded column for record and form work, this fills the entire stage
 * with no padding or scroll so a map (or other edge-to-edge surface) can own the
 * viewport and host its own floating controls.
 */
export function OutletFullPageMap({
	children,
	className,
	ref,
}: {
	readonly children: React.ReactNode;
	readonly className?: string;
	/** The stage element, for callers that lay chrome out against its width. */
	readonly ref?: React.RefCallback<HTMLDivElement> | undefined;
}) {
	return (
		<div className={cn('relative h-full min-h-0 w-full overflow-hidden', className)} ref={ref}>
			{children}
		</div>
	);
}
