import { Portal, Select } from '@chakra-ui/react';
import React from 'react';

import type { SelectRootProps } from '@chakra-ui/react';

export default function SimpleSelect({
  collection,
  ...props
}: SelectRootProps) {
  return (
    <Select.Root collection={collection} size="sm" {...props}>
      <Select.HiddenSelect />

      <Select.Control>
        <Select.Trigger
          bg="bg.subtle"
          borderColor="border.DEFAULT"
          borderRadius="md"
          color="fg"
          fontFamily="mono"
          transition="border-color 0.15s ease"
          _hover={{ borderColor: 'border.emphasized' }}
          _expanded={{ borderColor: 'accent' }}
        >
          <Select.ValueText />
        </Select.Trigger>

        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>

      <Portal>
        <Select.Positioner>
          <Select.Content
            bg="bg.emphasized"
            borderWidth="1px"
            borderColor="border.DEFAULT"
            borderRadius="md"
            boxShadow="0 12px 32px rgba(0, 0, 0, 0.5)"
          >
            {collection.items.map((region) => (
              <Select.Item
                item={region}
                key={region.value}
                fontFamily="mono"
                _hover={{ bg: 'bg.subtle' }}
                _selected={{ color: 'accent' }}
              >
                {region.label}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
