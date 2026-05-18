import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router';
import { adminLoginUrl, getServerUrl } from '../api';
import { Panel } from '../components/Panel';

const serverUrl = getServerUrl();

export const Route = createFileRoute('/_authenticated')({
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
	const { auth } = Route.useRouteContext();

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
					<Button asChild>
						<a href={adminLoginUrl(serverUrl)}>Sign in</a>
					</Button>
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
					<Button size="sm" type="submit" variant="outline">
						Sign out
					</Button>
				</form>
			</header>
			<Outlet />
		</>
	);
}
