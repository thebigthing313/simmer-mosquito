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
}: {
	readonly children: React.ReactNode;
	readonly className?: string;
}) {
	return (
		<div className={cn('relative h-full min-h-0 w-full overflow-hidden', className)}>
			{children}
		</div>
	);
}
