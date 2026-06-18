import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';

const BrandMark = iconRegistry.simmer.brandMark.icon;

/** Brand anchor at the top of the rail. */
export function PrimarySidebarHeader() {
	return (
		<div className="flex h-16 shrink-0 items-center justify-center">
			<div className="grid size-10 place-items-center rounded-md bg-simmer-green-600 text-white [&_svg]:size-[1.35rem]">
				<BrandMark aria-label="SIMMER" role="img" />
			</div>
		</div>
	);
}
