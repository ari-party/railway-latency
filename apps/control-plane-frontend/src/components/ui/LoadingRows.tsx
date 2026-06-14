import { Skeleton, Table } from '@chakra-ui/react';

interface LoadingRowsProps {
  columnCount: number;
}

const SKELETON_ROW_COUNT = 5;

export function LoadingRows({ columnCount }: LoadingRowsProps) {
  return (
    <>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <Table.Row key={rowIndex}>
          {Array.from({ length: columnCount }, (_, columnIndex) => (
            <Table.Cell key={columnIndex}>
              <Skeleton height="4" />
            </Table.Cell>
          ))}
        </Table.Row>
      ))}
    </>
  );
}
