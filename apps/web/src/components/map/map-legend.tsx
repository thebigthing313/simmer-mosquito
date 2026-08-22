import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { MAP_CHROME_SURFACE } from './chrome';

export interface MapLegendEntry {
	/** The colour the layer paints, imported from the layer's own constants. */
	readonly color: string;
	readonly label: string;
}

/**
 * What the marks on the map mean, for the surfaces that colour-code a status.
 *
 * A habitat map draws three lifecycle colours and, without this, nothing on the
 * page says which is which. The rail carries the same status as a worded badge,
 * so the pairing is what makes the colour readable rather than the colour
 * alone.
 *
 * A caller passes only the entries its current filters can actually put on
 * screen. A legend listing a colour that no dot is drawn in is a legend that
 * has to be ignored, and one that has to be ignored stops being read.
 */
export function MapLegend({ entries }: { readonly entries: readonly MapLegendEntry[] }) {
	if (entries.length === 0) {
		return null;
	}

	return (
		// A list of labels, not a description list: the swatch is the term, and a
		// colour is nothing a screen reader can read out. It hears the names.
		<ul
			aria-label="Map key"
			className={cn('grid gap-1.5 rounded-lg px-2.5 py-2 shadow-md', MAP_CHROME_SURFACE)}
		>
			{entries.map((entry) => (
				<li className="flex items-center gap-2" key={entry.label}>
					<span
						aria-hidden="true"
						className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/15"
						style={{ backgroundColor: entry.color }}
					/>
					<span className="text-foreground text-xs">{entry.label}</span>
				</li>
			))}
		</ul>
	);
}
