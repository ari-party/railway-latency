import {
  Center,
  FormatNumber,
  SegmentGroup,
  Stack,
  Table,
} from '@chakra-ui/react';
import React from 'react';

import { trpc } from '@/utils/trpc';

import type { RouterOutputs } from '@/utils/trpc';
import type { Network } from '@railway-latency/types';

const NETWORKS = [
  'private',
  'public',
  'proxied',
] as const satisfies readonly Network[];

export default function Root() {
  const [data, setData] = React.useState<RouterOutputs['table']['data']>({
    private: {},
    public: {},
    proxied: {},
  });
  const [network, setNetwork] = React.useState<Network>('private');

  const [initialData] = trpc.table.data.useSuspenseQuery();
  trpc.table.onChange.useSubscription(undefined, {
    onData: setData,
  });

  React.useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const networkData = data[network] ?? {};
  const regions = Object.keys(networkData);

  return (
    <Center height="100svh">
      <Stack gap={4} align="center">
        <SegmentGroup.Root
          value={network}
          width="max-content"
          onValueChange={(details) =>
            details.value && setNetwork(details.value as Network)
          }
        >
          <SegmentGroup.Indicator />
          {NETWORKS.map((option) => (
            <SegmentGroup.Item
              key={option}
              value={option}
              paddingInline={0}
              paddingX={3}
              paddingY={2}
            >
              <SegmentGroup.ItemText textTransform="capitalize">
                {option}
              </SegmentGroup.ItemText>
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>

        <Table.Root maxWidth="4xl">
          <Table.Header>
            <Table.Row>
              <Table.Cell />
              {regions.map((region) => (
                <Table.Cell key={region}>{region}</Table.Cell>
              ))}
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {regions.map((region) => (
              <Table.Row key={region}>
                <Table.Cell>{region}</Table.Cell>
                {regions.map((subRegion) => {
                  const value = networkData[region]?.[subRegion]?.http;

                  return (
                    <Table.Cell key={subRegion}>
                      {value ? (
                        <FormatNumber
                          value={value}
                          style="unit"
                          unit="millisecond"
                          unitDisplay="short"
                          minimumFractionDigits={3}
                          maximumFractionDigits={3}
                        />
                      ) : null}
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Stack>
    </Center>
  );
}
