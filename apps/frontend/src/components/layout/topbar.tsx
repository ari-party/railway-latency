import { Breadcrumb, Flex } from '@chakra-ui/react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';
import { LuHouse } from 'react-icons/lu';

import { NAV_ITEMS } from '@/components/layout/nav';

function breadcrumbSection(pathname: string): string | null {
  const match = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match ? match.label : null;
}

export function Topbar() {
  const { pathname } = useRouter();
  const section = breadcrumbSection(pathname);

  return (
    <Flex
      as="header"
      align="center"
      height="14"
      flexShrink={0}
      borderBottomWidth="1px"
      px="5"
    >
      <Breadcrumb.Root size="sm">
        <Breadcrumb.List alignItems="center">
          <Breadcrumb.Item>
            <Breadcrumb.Link
              asChild
              aria-label="Home"
              display="inline-flex"
              alignItems="center"
              color="fg.muted"
              _hover={{ color: 'fg' }}
            >
              <Link href="/">
                <LuHouse size={14} />
              </Link>
            </Breadcrumb.Link>
          </Breadcrumb.Item>
          {section && (
            <>
              <Breadcrumb.Separator />
              <Breadcrumb.Item>
                <Breadcrumb.CurrentLink color="blue.600" fontWeight="medium">
                  {section}
                </Breadcrumb.CurrentLink>
              </Breadcrumb.Item>
            </>
          )}
        </Breadcrumb.List>
      </Breadcrumb.Root>
    </Flex>
  );
}
