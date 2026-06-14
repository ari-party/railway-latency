import { Box, Flex } from '@chakra-ui/react';

import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <Flex height="100svh" overflow="hidden" bg="bg">
      <Sidebar />
      <Flex direction="column" flex="1" minWidth="0">
        <Topbar />
        <Box as="main" flex="1" overflowY="auto" p="5">
          <Box
            marginX="auto"
            width="full"
            maxWidth="6xl"
            overflow="hidden"
            rounded="xl"
            borderWidth="1px"
            bg="bg.panel"
          >
            {children}
          </Box>
        </Box>
      </Flex>
    </Flex>
  );
}
