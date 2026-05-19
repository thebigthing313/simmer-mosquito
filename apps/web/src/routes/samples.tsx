import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/samples')({
	component: () => (
		<StubPage
			kicker="Larval surveillance"
			title="Samples"
			body="Mock sample log for larval collections, counts, species notes, and lab handoff."
			items={[
				{ label: 'LS-2201 Cedar dip sample', detail: 'Fourth instar and pupae present', status: 'Positive', tone: 'danger' },
				{ label: 'LS-2197 Canal margin', detail: 'Culex larvae, low density', status: 'Logged', tone: 'info' },
				{ label: 'LS-2188 Oak Ridge', detail: 'No larvae observed', status: 'Negative', tone: 'success' },
			]}
		/>
	),
});
