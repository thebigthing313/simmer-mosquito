import { CircleLight } from '@simmer/ui/blocks/circle-light';
import { ScrollArea } from '@simmer/ui/components/scroll-area';
import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router';
import { MainOutletFooter } from '@/src/components/layout/main-outlet/main-outlet-footer';
import { MainOutletHeader } from '@/src/components/layout/main-outlet/main-outlet-header';
import { SidebarMenu } from '@/src/components/layout/sidebar/sidebar-menu';
import { MapboxMap } from '@/src/components/MapboxMap';

export const Route = createFileRoute('/(app)')({
	component: RouteComponent,
});

function RouteComponent() {
	const matches = useMatches();
	const currentMatch = matches[matches.length - 1];
	const { header = 'Dashboard', description = 'Overview' } =
		currentMatch?.context?.mainOutlet ?? {};
	return (
		// Full viewport container
		<div className="relative h-screen w-screen overflow-hidden font-sans">
			<div className="glassmorphic-float absolute inset-0 z-10">
				{/* ── Ambient gradient orbs (background decoration) ── */}
				<div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
					<div
						className="absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-20 blur-[100px]"
						style={{
							background:
								'radial-gradient(circle, rgba(52, 211, 153, 0.5), transparent 70%)',
						}}
					/>
					<div
						className="absolute -right-20 -bottom-20 h-80 w-80 rounded-full opacity-15 blur-[80px]"
						style={{
							background:
								'radial-gradient(circle, rgba(139, 92, 246, 0.5), transparent 70%)',
						}}
					/>
					<div
						className="absolute top-1/3 left-1/3 h-64 w-64 rounded-full opacity-10 blur-[80px]"
						style={{
							background:
								'radial-gradient(circle, rgba(59, 130, 246, 0.5), transparent 70%)',
						}}
					/>
				</div>

				{/* ── Floating status pills — top center ── */}
				<div className="absolute top-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2">
					{[
						{
							label: '847 Traps Active',
							icon: <CircleLight color="green" />,
						},
						{
							label: '3 Alerts',
							icon: <CircleLight color="yellow" />,
						},
						{
							label: '12 Zones',
							icon: <CircleLight color="purple" />,
						},
					].map((pill) => (
						<div
							key={pill.label}
							className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/40 px-4 py-1.5 backdrop-blur-xl"
						>
							{pill.icon}
							<span className="font-medium text-[11px] text-white/80">
								{pill.label}
							</span>
						</div>
					))}
				</div>

				<MapboxMap />
				<SidebarMenu />
				<div className="absolute top-20 bottom-20 left-20 z-30 flex w-115 flex-col overflow-hidden rounded-3xl border border-white/8 bg-zinc-900/30 shadow-[0_32px_80px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
					{/* Gradient accent bar at top */}
					<div className="h-0.5 w-full bg-linear-to-r from-simmer-green via-teal-400 to-simmer-yellow" />
					<MainOutletHeader header={header} description={description} />
					<ScrollArea className="flex-1 overflow-y-auto p-6 text-white/70">
						<Outlet />
					</ScrollArea>
					<MainOutletFooter />
				</div>
			</div>
		</div>
	);
}
