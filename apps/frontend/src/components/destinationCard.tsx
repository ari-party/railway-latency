import { Flex, HStack, Stack, Text } from '@chakra-ui/react';
import React from 'react';
import { LuArrowUpRight } from 'react-icons/lu';

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
      minWidth="0"
      borderWidth="1px"
      borderColor="border.DEFAULT"
      borderRadius="xl"
      bg="bg.panel"
      padding="4"
      gap="3"
    >
      <Flex justify="space-between" align="center">
        <HStack
          as="button"
          gap="1.5"
          color="fg"
          cursor="pointer"
          className="group"
          _hover={{ color: 'accent' }}
          onClick={onOpen}
        >
          <Text fontFamily="mono" fontWeight="semibold">
            {dst}
          </Text>
          <Text
            color="fg.subtle"
            transition="transform 0.15s ease, color 0.15s ease"
            _groupHover={{ color: 'accent', transform: 'translate(1px, -1px)' }}
          >
            <LuArrowUpRight size={15} />
          </Text>
        </HStack>
      </Flex>

      {children}
    </Stack>
  );
}
