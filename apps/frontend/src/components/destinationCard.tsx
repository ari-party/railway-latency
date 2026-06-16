import { Stack, Text, useToken } from '@chakra-ui/react';
import React from 'react';

import { statusColorToken } from '@/utils/anomaly';

import type { AnomalyStatus } from '@/utils/anomaly';

export function DestinationCard({
  children,
  dst,
  onOpen,
  status,
}: {
  children: React.ReactNode;
  dst: string;
  onOpen: () => void;
  status: AnomalyStatus;
}) {
  const [accent] = useToken('colors', [statusColorToken(status)]);

  return (
    <Stack
      borderWidth="1px"
      borderColor={status === 'ok' ? 'gray.200' : accent}
      borderRadius="lg"
      padding={4}
      gap={2}
    >
      <Text
        as="button"
        alignSelf="flex-start"
        fontWeight={600}
        color="white"
        cursor="pointer"
        _hover={{ textDecoration: 'underline' }}
        onClick={onOpen}
      >
        {dst}
      </Text>
      {children}
    </Stack>
  );
}
