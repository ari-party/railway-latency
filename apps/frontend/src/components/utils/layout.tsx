import { Box, Flex } from '@chakra-ui/react';
import React, { Suspense } from 'react';

import Navigation from '@/components/navigation';
import PlaceSwitchBar from '@/components/placeSwitchBar';
import { CenterSpinner } from '@/components/spinners';

import type { BoxProps } from '@chakra-ui/react';
import type { PropsWithChildren } from 'react';

export const LAYOUT_SHIFT_MEDIA = 'md';

export default function Layout({
  children,
  noPadding,
  overwriteTabLabel,
  ...props
}: PropsWithChildren<
  BoxProps & { noPadding?: boolean; overwriteTabLabel?: string }
>) {
  return (
    <Flex justifyContent="center">
      <Box
        as="main"
        display="grid"
        gridTemplateColumns={{
          md: 'max-content 1fr',
        }}
        gridTemplateRows={{
          base: '1fr max-content',
          md: 'unset',
        }}
        height="100svh"
        maxWidth="1920px"
        width="100%"
      >
        <Navigation />

        <Box
          display="grid"
          gridTemplateRows="max-content 1fr"
          overflow="hidden"
        >
          <PlaceSwitchBar overwriteTabLabel={overwriteTabLabel} />

          <Box
            overflow="auto"
            padding={
              noPadding
                ? undefined
                : {
                    base: 2,
                    md: 4,
                  }
            }
            paddingTop={noPadding ? undefined : 4}
            {...props}
          >
            <Suspense fallback={<CenterSpinner />}>{children}</Suspense>
          </Box>
        </Box>
      </Box>
    </Flex>
  );
}
