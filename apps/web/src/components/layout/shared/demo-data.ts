import type { Tone } from './types';

export interface WorkItem {
	readonly id: string;
	readonly label: string;
	readonly kind: string;
	readonly place: string;
	readonly status: string;
	readonly time: string;
	readonly tone: Tone;
}

export const todayWork: readonly WorkItem[] = [
	{
		id: 'SR-1048',
		label: 'Backyard standing water complaint',
		kind: 'Service request',
		place: '18 Maple Court',
		status: 'Needs triage',
		time: '8:20 AM',
		tone: 'attention',
	},
	{
		id: 'MI-221',
		label: 'North basin larval inspection route',
		kind: 'Mission',
		place: 'North Basin',
		status: 'Crew assigned',
		time: '9:00 AM',
		tone: 'info',
	},
	{
		id: 'HT-884',
		label: 'Retention pond follow-up',
		kind: 'Habitat',
		place: 'Cedar Industrial Park',
		status: 'Breeding positive',
		time: '10:15 AM',
		tone: 'danger',
	},
	{
		id: 'TR-318',
		label: 'EVS trap collection',
		kind: 'Adult surveillance',
		place: 'River Road',
		status: 'Ready to collect',
		time: '2:00 PM',
		tone: 'success',
	},
];

export interface RequestRecord {
	readonly id: string;
	readonly title: string;
	readonly address: string;
	readonly received: string;
	readonly source: string;
	readonly status: string;
	readonly priority: string;
	readonly nearby: string;
	readonly tone: Tone;
}

export const requests: readonly RequestRecord[] = [
	{
		id: 'SR-1048',
		title: 'Backyard standing water complaint',
		address: '18 Maple Court',
		received: 'Today, 8:20 AM',
		source: 'Phone',
		status: 'Needs triage',
		priority: 'High',
		nearby: '2 habitats, 1 trap, 1 recent control action',
		tone: 'attention',
	},
	{
		id: 'SR-1042',
		title: 'Request for catch basin treatment',
		address: '440 Pine Avenue',
		received: 'Yesterday, 4:10 PM',
		source: 'Web',
		status: 'Assigned',
		priority: 'Normal',
		nearby: 'Inside Oak Ridge treatment region',
		tone: 'info',
	},
	{
		id: 'SR-1037',
		title: 'Adult mosquito nuisance report',
		address: '91 Hillcrest Lane',
		received: 'May 16, 2026',
		source: 'Email',
		status: 'Waiting on inspection',
		priority: 'Normal',
		nearby: 'Trap TR-318 collected this week',
		tone: 'neutral',
	},
	{
		id: 'SR-1029',
		title: 'Drainage ditch follow-up',
		address: 'West canal access',
		received: 'May 14, 2026',
		source: 'Field staff',
		status: 'Closed',
		priority: 'Low',
		nearby: 'Source reduction recorded',
		tone: 'success',
	},
];

export interface SignalRecord {
	readonly label: string;
	readonly value: string;
	readonly detail: string;
	readonly tone: Tone;
}

export const thresholdSignals: readonly SignalRecord[] = [
	{ label: 'Rain accumulation', value: '1.4 in', detail: '48 hour total', tone: 'info' },
	{ label: 'Trap-night rate', value: '18.6', detail: 'North basin cluster', tone: 'attention' },
	{ label: 'Larval density', value: 'High', detail: 'Cedar Industrial Park', tone: 'danger' },
	{ label: 'Completed control', value: '12', detail: 'This week', tone: 'success' },
];
