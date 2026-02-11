import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer/ui/components/tooltip';
import { cn } from '@simmer/ui/lib/utils';
import type { ReactNode } from 'react';

export interface SideBarIconProps {
	id: string;
	tooltip: string;
	isActive: boolean;
	children?: ReactNode;
	handleClick: () => void;
}
export function SidebarIcon({
	id,
	children,
	tooltip,
	isActive,
	handleClick,
}: SideBarIconProps) {
	return (
		<Tooltip key={id}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => handleClick()}
					className={cn(
						'group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300',
						isActive
							? 'bg-white/15 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)]'
							: 'text-white/30 hover:bg-white/5 hover:text-white/60',
					)}
				>
					{children}
					{isActive && (
						<div className="absolute -right-1 h-4 w-1 rounded-full bg-linear-to-b from-simmer-dark-green via-teal-400 to-simmer-yellow shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="right"
				className="rounded-lg border-white/10 bg-zinc-900/80 text-white/90 backdrop-blur-xl"
			>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}
