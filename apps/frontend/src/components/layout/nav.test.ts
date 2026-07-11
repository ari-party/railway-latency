import { describe, expect, it } from 'vitest';

import { NAV_ITEMS, visibleNavItems } from './nav';

describe('visibleNavItems', () => {
  it('hides auth-required items when signed out', () => {
    const visible = visibleNavItems(NAV_ITEMS, false);
    expect(visible.some((item) => item.requiresAuth)).toBe(false);
  });

  it('shows all items when authed', () => {
    expect(visibleNavItems(NAV_ITEMS, true)).toHaveLength(NAV_ITEMS.length);
  });

  it('includes a globalping item that requires auth', () => {
    const globalping = NAV_ITEMS.find((item) => item.href === '/globalping');
    expect(globalping?.requiresAuth).toBe(true);
  });
});
