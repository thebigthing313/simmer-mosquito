import { createFileRoute } from '@tanstack/react-router';
import { ContactRegistrations } from '../../../components/registrations/contact-registrations';

export const Route = createFileRoute('/public-engagement/contacts/$id_/registrations')({
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	return <ContactRegistrations contactId={id} />;
}
