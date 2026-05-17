import { createRoute, Link, Outlet, redirect } from '@tanstack/react-router';
import { adminLoginUrl, getServerUrl } from '../api';
import { Panel } from '../components/Panel';
import { rootRoute } from './__root';

const serverUrl = getServerUrl();

export const authenticatedRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'authenticated',
	beforeLoad: ({ context, location }) => {
		if (context.auth === null) {
			return;
		}
		if (context.auth.authenticated === false) {
			throw redirect({
				to: '/auth',
				search: { redirect: location.href },
			});
		}
	},
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const { auth } = rootRoute.useRouteContext();

	if (auth === null) {
		return (
			<section className="shell">
				<Panel title="Checking session">
					<p>Loading operator session...</p>
				</Panel>
			</section>
		);
	}

	if (auth.authenticated === false) {
		return (
			<section className="shell">
				<Panel title="Sign in required">
					<p>Use an allowlisted SIMMER operator account to access admin tools.</p>
					<a className="button" href={adminLoginUrl(serverUrl)}>
						Sign in
					</a>
				</Panel>
			</section>
		);
	}

	return (
		<>
			<header className="topbar">
				<Link className="brand" to="/">
					SIMMER Admin
				</Link>
				<form action={`${serverUrl}/auth/logout`} method="post">
					<button className="button subtle" type="submit">
						Sign out
					</button>
				</form>
			</header>
			<Outlet />
		</>
	);
}
