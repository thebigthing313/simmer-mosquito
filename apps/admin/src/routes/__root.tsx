import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { AuthMe } from '../api';

// Exported because the generated route tree names this type in its inferred
// signatures; nothing imports it directly, but declaration emit needs it —
// unexporting it fails the build with TS4023.
// fallow-ignore-next-line unused-type
export interface RouterContext {
	readonly auth: AuthMe | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootLayout,
});

function RootLayout() {
	return (
		<div className="page">
			<main>
				<Outlet />
			</main>
		</div>
	);
}
