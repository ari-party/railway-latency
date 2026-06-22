import { LuChartLine, LuGauge, LuMap, LuScrollText } from 'react-icons/lu';

import type { IconType } from 'react-icons';

export interface NavItem {
  href: string;
  label: string;
  icon: IconType;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Explore', icon: LuChartLine },
  { href: '/fleet', label: 'Fleet', icon: LuMap },
  { href: '/metrics', label: 'Metrics', icon: LuGauge },
  { href: '/logs', label: 'Logs', icon: LuScrollText },
];
