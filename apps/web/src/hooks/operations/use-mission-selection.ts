import { useState } from 'react';
import type { MissionStopView } from '../../components/operations/operations-data';

/** What the page has picked out: on the map, and in whatever dialog is open. */
export interface MissionSelection {
	readonly selectedStopId: string | null;
	readonly setSelectedStopId: (id: string | null) => void;
	readonly highlightId: string | null;
	readonly setHighlightId: (id: string | null) => void;
	readonly skipTarget: MissionStopView | null;
	readonly setSkipTarget: (stop: MissionStopView | null) => void;
	readonly removeTarget: MissionStopView | null;
	readonly setRemoveTarget: (stop: MissionStopView | null) => void;
	readonly cancelOpen: boolean;
	readonly setCancelOpen: (open: boolean) => void;
	readonly reopenOpen: boolean;
	readonly setReopenOpen: (open: boolean) => void;
}

/**
 * What the mission page has picked out: the selected and highlighted stops on
 * the map, and whatever dialog is open.
 */
export function useMissionSelection(): MissionSelection {
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [skipTarget, setSkipTarget] = useState<MissionStopView | null>(null);
	const [removeTarget, setRemoveTarget] = useState<MissionStopView | null>(null);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [reopenOpen, setReopenOpen] = useState(false);

	return {
		selectedStopId,
		setSelectedStopId,
		highlightId,
		setHighlightId,
		skipTarget,
		setSkipTarget,
		removeTarget,
		setRemoveTarget,
		cancelOpen,
		setCancelOpen,
		reopenOpen,
		setReopenOpen,
	};
}
