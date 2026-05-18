import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AdminAppLayout, AdminContent, AdminSidebar } from '../components/AdminPrimitives';

export const Route = createFileRoute('/_authenticated/_admin')({
	component: AdminLayoutRoute,
});

function AdminLayoutRoute() {
	return (
		<AdminAppLayout>
			<AdminSidebar />
			<AdminContent>
				<Outlet />
			</AdminContent>
		</AdminAppLayout>
	);
}
