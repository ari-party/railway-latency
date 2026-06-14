import { KeyRound, Package, Server } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/probes', label: 'Probes', icon: Server },
  { href: '/admin-keys', label: 'Admin Keys', icon: KeyRound },
  { href: '/releases', label: 'Releases', icon: Package },
];
