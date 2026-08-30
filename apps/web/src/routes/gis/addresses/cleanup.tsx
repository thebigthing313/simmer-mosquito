import { createFileRoute } from '@tanstack/react-router';
import { RecordCleanup } from '../../../components/cleanup/record-cleanup';

export const Route = createFileRoute('/gis/addresses/cleanup')({
	component: () => <RecordCleanup recordType="address" />,
});
