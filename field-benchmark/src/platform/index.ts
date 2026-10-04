import { Capacitor } from '@capacitor/core';
import { androidPlatform } from './android';
import { browserPlatform } from './browser';
import { electronPlatform } from './electron';
import type { Platform } from './types';

export function detectPlatform(): Platform {
	if (window.benchElectron) return electronPlatform(window.benchElectron);
	if (Capacitor.getPlatform() === 'android') return androidPlatform();
	return browserPlatform();
}

export type { Platform, Recovery } from './types';
