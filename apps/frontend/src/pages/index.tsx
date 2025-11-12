import { Center, FormatNumber, Table } from '@chakra-ui/react';
import React from 'react';

import { trpc } from '@/utils/trpc';

import type { RouterOutputs } from '@/utils/trpc';

export default function Root() {
  const [data, setData] = React.useState<RouterOutputs['table']['data']>({});
  const [initialData] = trpc.table.data.useSuspenseQuery();
  trpc.table.onChange.useSubscription(undefined, {
    onData: setData,
  });

  React.useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const regions = Object.keys(data);

  return (
    <Center height="100svh">
      <Table.Root maxWidth="3xl">
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
                const value = data[region]?.http?.[subRegion];

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
    </Center>
  );
}
