import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { createRoute, redirect } from '@tanstack/react-router';
import { adminLoginUrl, getServerUrl } from '../api';
import { Panel } from '../components/Panel';
import { rootRoute } from './__root';

const serverUrl = getServerUrl();

export const authRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/auth',
	beforeLoad: ({ context }) => {
		if (context.auth?.authenticated === true) {
			throw redirect({ to: '/organizations' });
		}
	},
	component: AuthLandingRoute,
});

function AuthLandingRoute() {
	return (
		<section className="shell">
			<Panel title="Sign in">
				<p>Use your SIMMER operator account to manage agencies, taxonomy, and setup data.</p>
				<Button asChild>
					<a href={adminLoginUrl(serverUrl)}>Sign in</a>
				</Button>
			</Panel>
		</section>
	);
}
