import { Stack, Text } from '@chakra-ui/react';
import React from 'react';

export function DestinationCard({
  children,
  dst,
  onOpen,
}: {
  children: React.ReactNode;
  dst: string;
  onOpen: () => void;
}) {
  return (
    <Stack
      borderWidth="1px"
      borderColor="gray.200"
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
