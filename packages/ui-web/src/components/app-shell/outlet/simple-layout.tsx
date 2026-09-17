import {
	type PageContainerVariants,
	pageContainer,
} from '@simmer-mosquito/ui-web/components/page-container';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';

/**
 * The plain padded column for a route that is not a map: `pageContainer` in
 * `block` flow, so the children own their own spacing and the layout owns the
 * measure and the padding.
 *
 * How wide the column draws is the app's decision, so `measure` is read off
 * `pageContainer` and the caller names the variant, the shape #1040 gave
 * `OutletContentFallback`. The default is `page`, the 1200px column, because
 * that is where every mount point sat when the prop arrived: the catalogs,
 * the upcoming stubs, the inspections table, the contacts index and the
 * public engagement overview in `apps/web`, and every page in `apps/admin`
 * through `AdminPage`. A page that fills the stage passes `record`, the
 * 112rem cap the route-loading skeleton reserves, so the page arrives at the
 * width the skeleton stood in for (#1043).
 */
export function OutletSimpleLayout({
	children,
	className,
	measure = 'page',
}: {
	readonly children: React.ReactNode;
	readonly className?: string;
	/*
	 * `NonNullable` because cva reads `null` as "no variant, skip the default",
	 * which would draw the column with no cap at all, the third width the
	 * `page-container` docblock rejects.
	 */
	readonly measure?: NonNullable<PageContainerVariants['measure']>;
}) {
	return (
		<div
			className={cn(
				pageContainer({ flow: 'block', gap: 'none', measure, padding: 'page' }),
				className,
			)}
		>
			{children}
		</div>
	);
}
