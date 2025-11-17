import { Portal, Select } from '@chakra-ui/react';
import React from 'react';

import type { SelectRootProps } from '@chakra-ui/react';

export default function SimpleSelect({
  collection,
  ...props
}: SelectRootProps) {
  return (
    <Select.Root collection={collection} {...props}>
      <Select.HiddenSelect />

      <Select.Control>
        <Select.Trigger
          borderColor="gray.200"
          _hover={{ borderColor: 'pink.500' }}
          _expanded={{ borderColor: 'gray.200' }}
          transition="100ms"
        >
          <Select.ValueText />
        </Select.Trigger>

        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>

      <Portal>
        <Select.Positioner>
          <Select.Content>
            {collection.items.map((region) => (
              <Select.Item item={region} key={region.value}>
                {region.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
