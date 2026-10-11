import { ClusterIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { MapControlButton, MapControlGroup } from './map-control';

/**
 * The switch that turns map clustering on and off. Draws one toggle button,
 * pressed while clustering is on, and takes the current value and a setter.
 */
export function ClusterControl({
	on,
	onChange,
}: {
	readonly on: boolean;
	readonly onChange: (on: boolean) => void;
}) {
	return (
		<MapControlGroup>
			<MapControlButton label="Group nearby points" onClick={() => onChange(!on)} pressed={on}>
				<ClusterIcon aria-hidden="true" className="size-4" />
			</MapControlButton>
		</MapControlGroup>
	);
}
