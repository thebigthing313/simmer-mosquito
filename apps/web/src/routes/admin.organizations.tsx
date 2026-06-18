import { createFileRoute } from '@tanstack/react-router';
import { RouteStub } from '../components/app-shell/route-stub';

export const Route = createFileRoute('/admin/organizations')({
	component: () => <RouteStub title="Organizations" />,
});
