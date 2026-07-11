import { Box, IconButton, Stack } from '@chakra-ui/react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

import { NAV_ITEMS, visibleNavItems } from '@/components/layout/nav';
import { UserMenu } from '@/components/layout/userMenu';
import { Tooltip } from '@/components/ui/tooltip';
import { trpc } from '@/utils/trpc';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const { pathname } = useRouter();
  const { data: session } = trpc.session.useQuery();
  const authed = Boolean(session?.enabled && session.user);
  const items = visibleNavItems(NAV_ITEMS, authed);

  return (
    <Stack
      as="nav"
      aria-label="Main navigation"
      align="center"
      gap="1"
      width="60px"
      flexShrink={0}
      borderRightWidth="1px"
      borderColor="border.muted"
      bg="bg.subtle"
      py="3"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Tooltip
            key={item.href}
            content={item.label}
            positioning={{ placement: 'right' }}
            openDelay={300}
            closeDelay={100}
          >
            <Box position="relative" display="flex" justifyContent="center">
              {active && (
                <Box
                  position="absolute"
                  left="-12px"
                  top="50%"
                  height="18px"
                  width="3px"
                  borderRightRadius="full"
                  bg="accent"
                  transform="translateY(-50%)"
                />
              )}
              <IconButton
                asChild
                size="md"
                variant="ghost"
                aria-label={item.label}
                color={active ? 'accent' : 'fg.muted'}
                bg={active ? 'accent.subtle' : undefined}
                transition="background 0.15s ease, color 0.15s ease"
                _hover={{
                  bg: active ? 'accent.subtle' : 'bg.emphasized',
                  color: active ? 'accent' : 'fg',
                }}
              >
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={19} />
                </Link>
              </IconButton>
            </Box>
          </Tooltip>
        );
      })}

      <Box flex="1" />

      <UserMenu />
    </Stack>
  );
}
