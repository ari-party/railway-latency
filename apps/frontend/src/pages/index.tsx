import { Box, Table } from '@chakra-ui/react';
import React from 'react';

import { trpc } from '@/utils/trpc';

export default function Root() {
  const [data] = trpc.data.useSuspenseQuery(undefined, {
    refetchInterval: 5_000,
  });

  const regions = Object.keys(data);

  return (
    <Box height="100svh">
      <Table.Root>
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
              {regions.map((subRegion) => (
                <Table.Cell key={subRegion}>
                  {data[region][subRegion]}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
