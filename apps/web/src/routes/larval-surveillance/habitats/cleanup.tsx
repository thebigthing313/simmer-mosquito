import { createFileRoute } from '@tanstack/react-router';
import { RecordCleanup } from '../../../components/cleanup/record-cleanup';

export const Route = createFileRoute('/larval-surveillance/habitats/cleanup')({
	component: () => <RecordCleanup recordType="habitat" />,
});
