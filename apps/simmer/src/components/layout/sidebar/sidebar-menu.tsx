import { type LinkProps, useNavigate } from '@tanstack/react-router';
import { ChevronRight, Circle, LayoutDashboard, Settings } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import MosquitoIcon from '@/src/assets/mosquito-icon.svg?react';
import favicon from '@/src/assets/simmer-favicon.svg';
import { SidebarIcon } from './sidebar-icon';
import { SidebarSheet } from './sidebar-sheet';

type NavItem = {
	id: string;
	tooltip: string;
	icon: ReactNode;
	subItems?: Array<SubItem>;
};

type SubItem = {
	id: string;
	label: string;
	to: LinkProps;
};

const items: Array<NavItem> = [
	{
		id: 'adult-surveillance',
		tooltip: 'Adult Surveillance',
		icon: <MosquitoIcon className="h-4.5 w-4.5" />,
		subItems: [
			{
				id: 'traps',
				label: 'View Traps',
				to: { to: '/adult-surveillance/traps' },
			},
			{
				id: 'create-trap',
				label: 'Create New Trap',
				to: { to: '/adult-surveillance/create-trap' },
			},
		],
	},
	{
		id: 'settings',
		tooltip: 'Settings',
		icon: <Settings />,
	},
];

export function SidebarMenu() {
	const [activeNav, setActiveNav] = useState<string>('map');
	const [sheetOpen, setSheetOpen] = useState(false);
	const [selectedItem, setSelectedItem] = useState<NavItem | null>(null);
	const navigate = useNavigate();

	const handleNavClick = (item: NavItem) => {
		setActiveNav(item.id);
		if (item.subItems) {
			setSelectedItem(item);
			setSheetOpen(true);
		} else {
			setSheetOpen(false);
		}
	};

	return (
		<div className="absolute top-1/2 left-3 z-40 -translate-y-1/2">
			<div className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-zinc-900/30 p-2 shadow-2xl backdrop-blur-xl">
				{/* Logo */}
				<div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-simmer-dark-green/20 to-simmer-green/20">
					<img src={favicon} alt="SIMMER Favicon" className="h-5 w-5" />
				</div>
				<div className="mb-1 h-px w-6 bg-white/10" />
				<SidebarIcon
					id="dashboard-icon"
					tooltip="Dashboard"
					isActive={false}
					handleClick={() => navigate({ to: '/' })}
				>
					<LayoutDashboard />
				</SidebarIcon>
				{items.map((item) => {
					return (
						<SidebarIcon
							key={item.id}
							{...item}
							isActive={activeNav === item.id}
							handleClick={() => handleNavClick(item)}
						>
							{item.icon}
						</SidebarIcon>
					);
				})}
				<SidebarSheet
					title={selectedItem?.tooltip || ''}
					open={sheetOpen}
					onOpenChange={setSheetOpen}
				>
					{selectedItem?.subItems?.map((sub) => (
						<button
							key={sub.id}
							type="button"
							className="group flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-white/50 transition-all hover:bg-white/5 hover:text-white/80"
							onClick={() => {
								navigate(sub.to);
								setSheetOpen(false);
							}}
						>
							<Circle className="h-2 w-2 fill-current text-white/20 transition-colors group-hover:text-emerald-400" />
							<span>{sub.label}</span>
							<ChevronRight className="ml-auto h-3.5 w-3.5 text-white/10 transition-transform group-hover:translate-x-0.5 group-hover:text-white/30" />
						</button>
					))}
				</SidebarSheet>
			</div>
		</div>
	);
}
