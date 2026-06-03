import { Box, Center, ClientOnly, Spinner } from '@chakra-ui/react';
import React from 'react';

import { MtrMap } from '@/components/mtrMap';

export default function MapPage() {
  return (
    <Box height="100svh" width="100%">
      <ClientOnly
        fallback={
          <Center height="100svh">
            <Spinner />
          </Center>
        }
      >
        <MtrMap />
      </ClientOnly>
    </Box>
  );
}
