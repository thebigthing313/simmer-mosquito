import type { ComponentType } from 'react';
import { CollectionMapCard } from '../adult-surveillance/collection-map-card';
import { TrapMapCard } from '../adult-surveillance/trap-map-card';
import { ApplicationMapCard } from '../control-operations/application-map-card';
import { BiocontrolMapCard } from '../control-operations/biocontrol-map-card';
import { SourceReductionMapCard } from '../control-operations/source-reduction-map-card';
import { HabitatMapCard } from '../larval-surveillance/habitats/habitat-map-card';
import { InspectionMapCard } from '../larval-surveillance/inspection-map-card';
import type { MapInset } from '../map/map-inset';
import { OutreachMapCard } from '../public-engagement/outreach-map-card';
import { ServiceRequestMapCard } from '../public-engagement/service-request-map-card';
import type { ActivityEntry } from './activity-data';

interface ActivityCardProps {
	readonly id: string;
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}

const ACTIVITY_MAP_CARD: Readonly<
	Record<ActivityEntry['category'], ComponentType<ActivityCardProps>>
> = {
	habitat: HabitatMapCard,
	inspection: InspectionMapCard,
	trap: TrapMapCard,
	collection: CollectionMapCard,
	application: ApplicationMapCard,
	sourceReduction: SourceReductionMapCard,
	biocontrol: BiocontrolMapCard,
	outreach: OutreachMapCard,
	serviceRequest: ServiceRequestMapCard,
};

export function ActivityFocusCard({
	entry,
	inset,
	onClose,
}: {
	readonly entry: ActivityEntry | null;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	if (entry === null) {
		return null;
	}
	const CardForCategory = ACTIVITY_MAP_CARD[entry.category];
	return <CardForCategory id={entry.id} inset={inset} onClose={onClose} />;
}
