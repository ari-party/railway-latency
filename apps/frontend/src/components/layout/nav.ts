import {
  LuChartLine,
  LuGauge,
  LuGlobe,
  LuMap,
  LuRadioTower,
  LuScrollText,
} from 'react-icons/lu';

import type { IconType } from 'react-icons';

export interface NavItem {
  href: string;
  label: string;
  icon: IconType;
  requiresAuth?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    label: 'Explore',
    icon: LuChartLine,
  },
  {
    href: '/fleet',
    label: 'Fleet',
    icon: LuMap,
  },
  {
    href: '/metrics',
    label: 'Metrics',
    icon: LuGauge,
  },
  {
    href: '/pop',
    label: 'PoP',
    icon: LuRadioTower,
  },
  {
    href: '/globalping',
    label: 'Globalping',
    icon: LuGlobe,
    requiresAuth: true,
  },
  {
    href: '/logs',
    label: 'Logs',
    icon: LuScrollText,
  },
];

export function visibleNavItems(items: NavItem[], authed: boolean): NavItem[] {
  return items.filter((item) => !item.requiresAuth || authed);
}
