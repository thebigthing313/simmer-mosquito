import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)/')({
	beforeLoad: () => {
		return {
			mainOutlet: { header: 'Dashboard', description: 'Surveillance overview' },
		}
	},
	component: DashboardContent,
});

function DashboardContent() {
	return (
		<div className="flex flex-col gap-5">
			{/* Quick stats row */}
			<div className="grid grid-cols-3 gap-3">
				{[
					{ label: 'Active Traps', value: '847', change: '+12 this week' },
					{ label: 'Collections', value: '2,847', change: '+34 today' },
					{ label: 'Positive Pools', value: '23', change: '2.4% rate' },
				].map((stat) => (
					<div
						key={stat.label}
						className="rounded-lg border border-current/6 bg-current/3 p-3"
					>
						<div className="text-xs opacity-50">{stat.label}</div>
						<div className="mt-1 font-bold text-xl tabular-nums">
							{stat.value}
						</div>
						<div className="mt-0.5 text-[10px] opacity-40">{stat.change}</div>
					</div>
				))}
			</div>

			{/* Recent activity */}
			<div>
				<h3 className="mb-2.5 font-semibold text-xs uppercase tracking-wide opacity-50">
					Recent Activity
				</h3>
				<div className="flex flex-col gap-1">
					{[
						{
							action: 'Collection completed',
							detail: 'Trap #127 — Zone North',
							time: '12 min ago',
						},
						{
							action: 'New alert triggered',
							detail: 'High density — Sector 4B',
							time: '34 min ago',
						},
						{
							action: 'Inspection scheduled',
							detail: 'Route 7 — 14 traps',
							time: '1 hr ago',
						},
						{
							action: 'Species identified',
							detail: 'Cx. quinquefasciatus — Pool #89',
							time: '2 hrs ago',
						},
						{
							action: 'Trap deployed',
							detail: 'BG-Sentinel — Zone East',
							time: '3 hrs ago',
						},
					].map((item) => (
						<div
							key={item.time}
							className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-current/4"
						>
							<div className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-25" />
							<div className="flex-1 text-xs">
								<span className="font-medium">{item.action}</span>
								<span className="opacity-40"> — {item.detail}</span>
							</div>
							<span className="shrink-0 text-[10px] tabular-nums opacity-30">
								{item.time}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Zones summary */}
			<div>
				<h3 className="mb-2.5 font-semibold text-xs uppercase tracking-wide opacity-50">
					Active Zones
				</h3>
				<div className="grid grid-cols-2 gap-2">
					{[
						{ name: 'North District', traps: 124, status: 'Normal' },
						{ name: 'South Sector', traps: 89, status: 'Elevated' },
						{ name: 'East Corridor', traps: 203, status: 'Normal' },
						{ name: 'West Basin', traps: 67, status: 'Alert' },
						{ name: 'North District', traps: 124, status: 'Normal' },
						{ name: 'South Sector', traps: 89, status: 'Elevated' },
						{ name: 'East Corridor', traps: 203, status: 'Normal' },
						{ name: 'West Basin', traps: 67, status: 'Alert' },
						{ name: 'North District', traps: 124, status: 'Normal' },
						{ name: 'South Sector', traps: 89, status: 'Elevated' },
						{ name: 'East Corridor', traps: 203, status: 'Normal' },
						{ name: 'West Basin', traps: 67, status: 'Alert' },
						{ name: 'North District', traps: 124, status: 'Normal' },
						{ name: 'South Sector', traps: 89, status: 'Elevated' },
						{ name: 'East Corridor', traps: 203, status: 'Normal' },
						{ name: 'West Basin', traps: 67, status: 'Alert' },
					].map((zone) => (
						<div
							key={zone.name}
							className="flex items-center justify-between rounded-md border border-current/6 px-3 py-2"
						>
							<div>
								<div className="font-medium text-xs">{zone.name}</div>
								<div className="text-[10px] opacity-40">{zone.traps} traps</div>
							</div>
							<div
								className={`rounded-full px-2 py-0.5 font-semibold text-[9px] uppercase ${
									zone.status === 'Alert'
										? 'bg-red-500/10 text-red-400'
										: zone.status === 'Elevated'
											? 'bg-amber-500/10 text-amber-400'
											: 'bg-emerald-500/10 text-emerald-400'
								}`}
							>
								{zone.status}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
