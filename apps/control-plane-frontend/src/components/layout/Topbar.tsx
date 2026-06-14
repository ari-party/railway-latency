import { Breadcrumb, Flex } from '@chakra-ui/react';
import { Home } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';

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
            >
              <Link href="/probes">
                <Home size={14} />
              </Link>
            </Breadcrumb.Link>
          </Breadcrumb.Item>
          {section && (
            <>
              <Breadcrumb.Separator />
              <Breadcrumb.Item>
                <Breadcrumb.CurrentLink color="purple.fg" fontWeight="medium">
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
