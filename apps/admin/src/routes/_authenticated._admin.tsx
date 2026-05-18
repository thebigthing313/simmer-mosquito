import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/_admin')({
	component: AdminLayoutRoute,
});

function AdminLayoutRoute() {
	return (
		<div className="admin-layout">
			<aside className="admin-sidebar" aria-label="Admin sections">
				<div className="sidebar-heading">
					<span>Control plane</span>
				</div>
				<Link activeProps={{ className: 'active' }} to="/organizations">
					Organizations
				</Link>
				<Link activeProps={{ className: 'active' }} to="/taxonomy">
					Mosquito taxonomy
				</Link>
				<Link activeProps={{ className: 'active' }} to="/units">
					Units
				</Link>
			</aside>
			<div className="admin-content">
				<Outlet />
			</div>
		</div>
	);
}
