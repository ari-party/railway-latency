import { IconButton, Stack } from '@chakra-ui/react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

import { NAV_ITEMS } from '@/components/layout/nav';
import { Tooltip } from '@/components/ui/tooltip';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const { pathname } = useRouter();

  return (
    <Stack
      as="nav"
      aria-label="Main navigation"
      align="center"
      gap="1"
      width="58px"
      flexShrink={0}
      borderRightWidth="1px"
      py="3"
    >
      {NAV_ITEMS.map((item) => {
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
            <IconButton
              asChild
              size="sm"
              variant="ghost"
              aria-label={item.label}
              color={active ? 'blue.600' : 'fg.muted'}
              bg={active ? 'blue.50' : undefined}
              _hover={{
                bg: active ? 'blue.50' : 'gray.100',
                color: active ? 'blue.600' : 'fg',
              }}
            >
              <Link href={item.href} aria-current={active ? 'page' : undefined}>
                <Icon />
              </Link>
            </IconButton>
          </Tooltip>
        );
      })}
    </Stack>
  );
}
