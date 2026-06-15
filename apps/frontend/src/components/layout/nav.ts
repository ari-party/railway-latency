import { LuChartLine, LuMap } from 'react-icons/lu';

import type { IconType } from 'react-icons';

export interface NavItem {
  href: string;
  label: string;
  icon: IconType;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Explore', icon: LuChartLine },
  { href: '/map', label: 'Map', icon: LuMap },
];
