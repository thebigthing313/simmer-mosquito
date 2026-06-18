import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { demoOrganizations, demoUser } from '../components/app-shell/demo-data';
import { shellDomains } from '../components/app-shell/navigation';
import { OutletShell } from '../components/app-shell/outlet/outlet-shell';
import { OutletSimpleLayout } from '../components/app-shell/outlet/simple-layout';
import { ShellProvider } from '../components/app-shell/shell-context';

export const Route = createFileRoute('/app-shell-preview')({
	component: AppShellPreview,
});

/**
 * Standalone, auth-free harness for the app shell. Renders the chrome with demo
 * data and an internal active-path so the rail, secondary nav, switcher, header,
 * and outlet can be exercised without the server or router context.
 */
function AppShellPreview() {
	const [activePath, setActivePath] = useState('/habitats');
	const [organizationId, setOrganizationId] = useState(demoOrganizations[0]?.id ?? '');
	const currentOrganization =
		demoOrganizations.find((organization) => organization.id === organizationId) ??
		demoOrganizations[0];

	if (currentOrganization === undefined) {
		return null;
	}

	return (
		<ShellProvider
			organizations={demoOrganizations}
			currentOrganization={currentOrganization}
			onSelectOrganization={setOrganizationId}
			user={demoUser}
			domains={shellDomains}
			activePath={activePath}
			onNavigate={setActivePath}
			onSignOut={() => undefined}
		>
			<OutletShell>
				<OutletSimpleLayout>
					<PreviewContent activePath={activePath} />
				</OutletSimpleLayout>
			</OutletShell>
		</ShellProvider>
	);
}

function PreviewContent({ activePath }: { readonly activePath: string }) {
	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
				<div className="max-w-[60ch]">
					<h1 className="text-2xl font-bold text-foreground">Habitats</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Standing-water sites under surveillance. Inspect, record larval findings, and schedule
						source reduction.
					</p>
				</div>
				<Button>Add habitat</Button>
			</header>

			<ul className="flex flex-col gap-2">
				{sampleHabitats.map((habitat) => (
					<li
						key={habitat.id}
						className="flex items-center justify-between gap-4 rounded-md border border-border bg-card px-4 py-3.5"
					>
						<div className="min-w-0">
							<p className="truncate font-medium text-foreground">{habitat.name}</p>
							<p className="truncate text-sm text-muted-foreground">
								{habitat.id} · {habitat.place}
							</p>
						</div>
						<Badge variant="outline" tone={habitat.tone}>
							{habitat.status}
						</Badge>
					</li>
				))}
			</ul>

			<p className="text-xs text-muted-foreground">
				Active path: <code className="rounded bg-muted px-1.5 py-0.5">{activePath}</code>
			</p>
		</div>
	);
}

const sampleHabitats = [
	{
		id: 'HT-884',
		name: 'Retention pond — Cedar Industrial Park',
		place: 'North Basin',
		status: 'Breeding positive',
		tone: 'danger' as const,
	},
	{
		id: 'HT-901',
		name: 'Roadside ditch — River Road',
		place: 'East district',
		status: 'Monitoring',
		tone: 'info' as const,
	},
	{
		id: 'HT-742',
		name: 'Storm drain cluster — Maple Court',
		place: 'Downtown',
		status: 'Treated',
		tone: 'success' as const,
	},
	{
		id: 'HT-655',
		name: 'Flooded lot — Hillcrest Lane',
		place: 'West district',
		status: 'Needs inspection',
		tone: 'warning' as const,
	},
];
