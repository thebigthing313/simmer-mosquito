import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';

/**
 * The default content layout for routes that don't need a map: a centered,
 * comfortably padded column. Map-bearing layouts will live alongside this as the
 * app grows; this one keeps record and form work readable and uncrowded.
 */
export function OutletSimpleLayout({
	children,
	className,
}: {
	readonly children: React.ReactNode;
	readonly className?: string;
}) {
	return (
		<div className={cn('mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8', className)}>
			{children}
		</div>
	);
}
