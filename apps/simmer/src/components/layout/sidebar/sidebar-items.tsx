import type { LinkProps } from '@tanstack/react-router';
import {
	Earth,
	LayoutDashboard,
	PersonStanding,
	SettingsIcon,
	SprayCan,
	Worm,
} from 'lucide-react';
import type { ReactNode } from 'react';
import MosquitoIcon from '@/src/assets/mosquito-icon.svg?react';

export type NavItem = {
	id: string;
	tooltip: string;
	icon: ReactNode;
	subItems?: Array<SubItem>;
	to?: LinkProps;
};

export type SubItem = {
	id: string;
	label: string;
	to: LinkProps;
};

const Dashboard: NavItem = {
	id: 'dashboard',
	tooltip: 'Dashboard',
	icon: <LayoutDashboard className="h-4.5 w-4.5" />,
	to: { to: '/' },
};

const AdultSurveillance: NavItem = {
	id: 'adult-surveillance',
	tooltip: 'Adult Surveillance',
	icon: <MosquitoIcon className="h-4.5 w-4.5" />,
	subItems: [
		{
			id: 'traps',
			label: 'Traps',
			to: { to: '/adult-surveillance/traps' },
		},
		{
			id: 'collections',
			label: 'Collections',
			to: { to: '/adult-surveillance/collections' },
		},
		{
			id: 'landing-rates',
			label: 'Landing Rates',
			to: { to: '/adult-surveillance/landing-rates' },
		},
	],
};

const LarvalSurveillance: NavItem = {
	id: 'larval-surveillance',
	tooltip: 'Larval Surveillance',
	icon: <Worm className="h-4.5 w-4.5" />,
	subItems: [
		{
			id: 'larval-habitats',
			label: 'Larval Habitats',
			to: { to: '/larval-surveillance/habitats' },
		},
		{
			id: 'inspections',
			label: 'Inspections',
			to: { to: '/larval-surveillance/inspections' },
		},
		{
			id: 'aerial-sites',
			label: 'Aerial Sites',
			to: { to: '/larval-surveillance/aerial-sites' },
		},
		{
			id: 'aerial-inspections',
			label: 'Aerial Inspections',
			to: { to: '/larval-surveillance/aerial-inspections' },
		},
	],
};

const GISData: NavItem = {
	id: 'gis-data',
	tooltip: 'GIS Data',
	icon: <Earth className="h-4.5 w-4.5" />,
	subItems: [
		{
			id: 'addresses',
			label: 'Addresses',
			to: { to: '/gis/addresses' },
		},
		{
			id: 'regions',
			label: 'Regions',
			to: { to: '/gis/regions' },
		},
		{
			id: 'routes',
			label: 'Routes',
			to: { to: '/gis/routes' },
		},
	],
};

const PublicOutreach: NavItem = {
	id: 'public-outreach',
	tooltip: 'Public Outreach',
	icon: <PersonStanding className="h-4.5 w-4.5" />,
	subItems: [
		{
			id: 'contacts',
			label: 'Contacts',
			to: { to: '/public-outreach/contacts' },
		},
		{
			id: 'service-requests',
			label: 'Service Requests',
			to: { to: '/public-outreach/service-requests' },
		},
		{
			id: 'notification-requests',
			label: 'Notification Requests',
			to: { to: '/public-outreach/notifications' },
		},
	],
};

const InsecticideControl: NavItem = {
	id: 'insecticide-control',
	tooltip: 'Insecticide Control',
	icon: <SprayCan className="h-4.5 w-4.5" />,
	subItems: [
		{
			id: 'insecticides',
			label: 'Insecticides',
			to: { to: '/insecticide-control/insecticides' },
		},
		{
			id: 'insecticide-applications',
			label: 'Insecticide Applications',
			to: { to: '/insecticide-control/applications' },
		},
		{
			id: 'truck-ulvs',
			label: 'Truck ULV Applications',
			to: { to: '/insecticide-control/truck-ulvs' },
		},
		{
			id: 'hand-ulvs',
			label: 'Hand ULV Applications',
			to: { to: '/insecticide-control/hand-ulvs' },
		},
		{
			id: 'ulv-missions-schedule',
			label: 'Scheduled ULV Missions',
			to: { to: '/insecticide-control/ulv-missions' },
		},
		{
			id: 'aerial-larviciding',
			label: 'Aerial Larviciding',
			to: { to: '/insecticide-control/flights' },
		},
		{
			id: 'catch-basin-applications',
			label: 'Catch Basin Applications',
			to: { to: '/insecticide-control/catch-basin-missions' },
		},
	],
};

const Settings: NavItem = {
	id: 'settings',
	tooltip: 'Settings',
	icon: <SettingsIcon className="h-4.5 w-4.5" />,
	to: { to: '/settings' },
};
export const NavItems: Array<NavItem> = [
	Dashboard,
	AdultSurveillance,
	LarvalSurveillance,
	InsecticideControl,
	GISData,
	PublicOutreach,
	Settings,
];
