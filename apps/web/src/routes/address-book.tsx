import { createFileRoute } from '@tanstack/react-router';
import { StubPage } from './-components';

export const Route = createFileRoute('/address-book')({
	component: () => (
		<StubPage
			kicker="GIS data"
			title="Address book"
			body="Mock address records for geocoded service locations, parcels, aliases, and operational context."
			items={[
				{
					label: '18 Maple Court',
					detail: 'Matched parcel, service request SR-1048',
					status: 'Matched',
					tone: 'success',
				},
				{
					label: 'West canal access',
					detail: 'Field landmark, no parcel owner',
					status: 'Needs review',
					tone: 'attention',
				},
				{
					label: '440 Pine Avenue',
					detail: 'Inside Oak Ridge treatment region',
					status: 'Matched',
					tone: 'info',
				},
			]}
		/>
	),
});
