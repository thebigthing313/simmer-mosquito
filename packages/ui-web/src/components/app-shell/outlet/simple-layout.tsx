import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';

/**
 * The default content layout for routes that don't need a map: a centered,
 * comfortably padded column. Map-bearing layouts will live alongside this as the
 * app grows; this one keeps record and form work readable and uncrowded.
 *
 * The measure and padding come from `pageContainer` so this layout and the
 * grid-flow route pages cannot drift apart; the `block` flow is what makes this
 * a plain column rather than a section grid.
 */
export function OutletSimpleLayout({
	children,
	className,
}: {
	readonly children: React.ReactNode;
	readonly className?: string;
}) {
	return (
		<div className={cn(pageContainer({ flow: 'block', gap: 'none', padding: 'page' }), className)}>
			{children}
		</div>
	);
}
