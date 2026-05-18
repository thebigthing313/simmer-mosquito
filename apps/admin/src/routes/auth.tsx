import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { adminLoginUrl, getServerUrl } from '../api';
import { PageShell } from '../components/AdminPrimitives';
import { Panel } from '../components/Panel';

const serverUrl = getServerUrl();

export const Route = createFileRoute('/auth')({
	beforeLoad: ({ context }) => {
		if (context.auth?.authenticated === true) {
			throw redirect({ to: '/organizations' });
		}
	},
	component: AuthLandingRoute,
});

function AuthLandingRoute() {
	return (
		<PageShell width="default">
			<Panel title="Sign in">
				<p>Use your SIMMER operator account to manage agencies, taxonomy, and setup data.</p>
				<Button asChild>
					<a href={adminLoginUrl(serverUrl)}>Sign in</a>
				</Button>
			</Panel>
		</PageShell>
	);
}
