import { ErrorReport } from '@simmer-mosquito/ui-web/components/error-report/error-report';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Card } from '@simmer-mosquito/ui-web/components/ui/card';

/**
 * The error surface for a route that threw inside the shell.
 *
 * Wired as the router's `defaultErrorComponent`, so it covers every route that
 * does not name its own. Before it existed those routes fell to TanStack's
 * built-in component, which renders the message in a bare `<pre>` and offers
 * nothing to act on.
 *
 * It is a page-region panel, not a full-viewport one, because only the region
 * failed. The rail, the navigation column, and the header are all still standing
 * and still usable, so replacing them would take away the reader's way out of a
 * page that does not work. That is the whole difference from
 * `WorkspaceChromeError`, which renders when the shell itself never mounted and
 * there is nothing else on screen.
 *
 * `reset` here is the router's, which reloads the route match rather than only
 * clearing the boundary, so "Try again" genuinely re-runs the load.
 */
export function RouteErrorPage({
	error,
	info,
	reset,
	version,
}: {
	readonly error?: unknown;
	readonly info?: { readonly componentStack: string } | undefined;
	readonly reset?: (() => void) | undefined;
	readonly version: string;
}) {
	return (
		<div className={pageContainer({ gap: 'none', padding: 'page' })}>
			<Card className="w-full max-w-[680px] overflow-hidden" variant="panel">
				<ErrorReport
					error={error}
					info={info}
					reset={reset}
					title="This page did not load"
					version={version}
				/>
			</Card>
		</div>
	);
}
