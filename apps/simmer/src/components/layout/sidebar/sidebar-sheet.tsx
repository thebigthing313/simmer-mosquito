import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from '@simmer/ui/components/sheet';

interface SidebarSheetProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	title: string;
	children: React.ReactNode;
}
export function SidebarSheet({
	title,
	children,
	open,
	onOpenChange,
}: SidebarSheetProps) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="left"
				className="left-18 w-72 border-white/5 border-r bg-zinc-900/40 backdrop-blur-2xl [&>button]:text-white/40"
				style={{ fontFamily: "'DM Sans', sans-serif" }}
			>
				<SheetHeader>
					<SheetTitle className="font-semibold text-base text-white/90">
						{title}
					</SheetTitle>
				</SheetHeader>
				<div className="mt-4 flex flex-col gap-1 px-2">{children}</div>
			</SheetContent>
		</Sheet>
	);
}
