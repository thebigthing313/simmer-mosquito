import { CircleLight } from '@simmer/ui/blocks/circle-light';

interface MainOutletHeaderProps {
	header: string;
	description: string;
}
export function MainOutletHeader({
	header,
	description,
}: MainOutletHeaderProps) {
	return (
		<div className="flex items-center justify-between border-white/5 border-b px-6 py-5">
			<div>
				<h2 className="font-semibold text-lg text-white/90">{header}</h2>
				<p className="mt-0.5 text-white/30 text-xs">{description}</p>
			</div>
			<div className="flex items-center gap-1.5">
				<CircleLight color="green" />
				<CircleLight color="purple" />
				<CircleLight color="yellow" />
			</div>
		</div>
	);
}
