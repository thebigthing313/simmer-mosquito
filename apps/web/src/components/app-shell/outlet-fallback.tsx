import { OutletContentFallback } from '@simmer-mosquito/ui-web/components/app-shell';

/**
 * The route-loading skeleton at the width this app's pages draw at. Both mount
 * points read it, the router's `defaultPendingComponent` in `main.tsx` and the
 * backstop `Suspense` around `<Outlet />` in `app-shell-root.tsx`, so the two
 * cannot name different measures.
 *
 * `record` is the 112rem cap the detail pages fill the stage under, and it is
 * the widest measure `pageContainer` has. Every route here fills the stage
 * since #1043, and the 1200px default reserved a column the page then drew
 * past (#1040).
 */
export function WebOutletFallback() {
	return <OutletContentFallback measure="record" />;
}
