import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/_admin')({
	component: AdminLayoutRoute,
});

function AdminLayoutRoute() {
	return (
		<div className="admin-layout">
			<aside className="admin-sidebar variant-tonal" aria-label="Admin sections">
				<div className="sidebar-heading">
					<span>Control plane</span>
					<span className="nav-count">3 sections</span>
				</div>
				<Link activeProps={{ className: 'active' }} to="/organizations">
					<span className="nav-index">01</span>
					<span>Organizations</span>
				</Link>
				<Link activeProps={{ className: 'active' }} to="/taxonomy">
					<span className="nav-index">02</span>
					<span>Mosquito taxonomy</span>
				</Link>
				<Link activeProps={{ className: 'active' }} to="/units">
					<span className="nav-index">03</span>
					<span>Units</span>
				</Link>
			</aside>
			<div className="admin-content">
				<Outlet />
			</div>
		</div>
	);
}
