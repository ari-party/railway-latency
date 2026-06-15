import { Box, Flex } from '@chakra-ui/react';
import React from 'react';

import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Flex height="100svh" overflow="hidden" bg="bg">
      <Sidebar />
      <Flex direction="column" flex="1" minWidth="0">
        <Topbar />
        <Box as="main" flex="1" minHeight="0" overflow="hidden">
          {children}
        </Box>
      </Flex>
    </Flex>
  );
}
