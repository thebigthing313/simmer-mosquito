import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/contacts')({
	component: () => (
		<StubPage
			kicker="Public engagement"
			title="Contacts"
			body="Mock contact book for residents, property managers, agencies, and communication preferences."
			items={[
				{ label: 'Avery Reed', detail: '18 Maple Court, prefers phone updates', status: 'Open request', tone: 'attention' },
				{ label: 'Cedar Industrial Park manager', detail: 'Treatment access contact', status: 'Verified', tone: 'success' },
				{ label: 'Oak Ridge HOA', detail: 'Route notices and public education partner', status: 'Active', tone: 'info' },
			]}
		/>
	),
});
