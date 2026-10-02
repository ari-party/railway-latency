import { ClientOnly, Text } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import React, { Suspense } from 'react';

import {
  PopOverviewGrid,
  PopOverviewGridSkeleton,
} from '@/components/pop/popOverviewGrid';
import { PopPageLayout, usePopHref } from '@/components/pop/popPageLayout';
import { trpc } from '@/utils/trpc';

export default function PopOverview() {
  const router = useRouter();
  const popHref = usePopHref();

  const [pops] = trpc.pops.list.useSuspenseQuery();
  const [regions] = trpc.regions.useSuspenseQuery();

  const popList = pops ?? [];

  return (
    <PopPageLayout regions={regions}>
      {({ dst, range }) =>
        pops == null ? (
          <Text color="fg.muted">PoP data is currently unavailable.</Text>
        ) : popList.length === 0 ? (
          <Text color="fg.muted">
            No public traffic through any Railway PoP in the last 24 hours.
          </Text>
        ) : (
          <ClientOnly
            fallback={<PopOverviewGridSkeleton count={popList.length} />}
          >
            <Suspense
              fallback={<PopOverviewGridSkeleton count={popList.length} />}
            >
              <PopOverviewGrid
                dst={dst}
                pops={popList}
                range={range}
                onFocus={(pop) => void router.push(popHref(pop))}
              />
            </Suspense>
          </ClientOnly>
        )
      }
    </PopPageLayout>
  );
}
