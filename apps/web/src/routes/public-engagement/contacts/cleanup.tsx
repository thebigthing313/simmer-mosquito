import { createFileRoute } from '@tanstack/react-router';
import { RecordCleanup } from '../../../components/cleanup/record-cleanup';

export const Route = createFileRoute('/public-engagement/contacts/cleanup')({
	component: () => <RecordCleanup recordType="contact" />,
});
