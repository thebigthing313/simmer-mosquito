import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/habitats')({
	component: () => (
		<StubPage
			kicker="Larval surveillance"
			title="Habitats"
			body="Mock habitat index for standing water sites, breeding status, and inspection cadence."
			items={[
				{ label: 'HT-884 Retention pond', detail: 'Cedar Industrial Park, breeding positive', status: 'Needs action', tone: 'danger' },
				{ label: 'HT-612 Canal margin', detail: 'North canal access, inspected yesterday', status: 'Monitoring', tone: 'info' },
				{ label: 'HT-241 Stormwater basin', detail: 'Oak Ridge, dry at last visit', status: 'Clear', tone: 'success' },
			]}
		/>
	),
});
