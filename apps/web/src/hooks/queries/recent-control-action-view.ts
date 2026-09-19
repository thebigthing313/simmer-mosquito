/** One control action as a recent-activity list shows it. */
export interface RecentControlAction {
	readonly id: string;
	readonly actionDate: string;
	readonly methodId: string;
	readonly methodName: string;
	readonly technicianProfileId: string | null;
	readonly technicianName: string | null;
	readonly amount: number;
	readonly unitAbbreviation: string | null;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
}

export interface RecentResult {
	readonly actions: readonly RecentControlAction[];
	readonly isReady: boolean;
	readonly isError: boolean;
}
