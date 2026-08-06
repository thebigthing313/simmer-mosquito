import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useActiveDomainIndex } from '../shell-context';
import {
	PRIMARY_ICON_SIZE,
	PRIMARY_ITEM_PITCH,
	PRIMARY_LIST_PADDING_Y,
} from './primary-sidebar-icon';

const INDICATOR_HEIGHT = PRIMARY_ICON_SIZE;
const INDICATOR_TOP = PRIMARY_LIST_PADDING_Y;

/**
 * The bar on the rail's right edge marking the active domain. It is absolutely
 * positioned inside the icon list and slides on the Y axis as the active domain
 * changes; reduced-motion users get an instant move.
 */
export function PrimarySidebarActiveIndicator() {
	const activeIndex = useActiveDomainIndex();

	if (activeIndex < 0) {
		return null;
	}

	return (
		<span
			aria-hidden="true"
			className={cn(
				'pointer-events-none absolute right-0 w-[3px] rounded-full bg-simmer-yellow-300',
				'transition-transform duration-(--simmer-motion-standard) ease-(--simmer-ease-out)',
				'motion-reduce:transition-none',
			)}
			style={{
				height: INDICATOR_HEIGHT,
				top: INDICATOR_TOP,
				transform: `translateY(${activeIndex * PRIMARY_ITEM_PITCH}px)`,
			}}
		/>
	);
}
