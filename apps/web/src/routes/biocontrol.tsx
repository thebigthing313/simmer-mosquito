import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/biocontrol')({
	component: () => (
		<StubPage
			kicker="Control actions"
			title="Biocontrol"
			body="Mock biocontrol program tracking for fish stocking, habitat suitability, and follow-up inspections."
			items={[
				{ label: 'Retention pond stocking', detail: 'Mosquitofish suitability check required', status: 'Needs review', tone: 'attention' },
				{ label: 'School wetland site', detail: 'Follow-up scheduled after introduction', status: 'Scheduled', tone: 'info' },
				{ label: 'North canal segment', detail: 'Population observed during last inspection', status: 'Stable', tone: 'success' },
			]}
		/>
	),
});
