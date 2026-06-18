import { Box, chakra } from '@chakra-ui/react';
import { memo } from 'react';

import {
  checkStatusLabel,
  STATUS_TONE_COLOR,
} from '@/components/logs/checkStatus';

import type { CheckEventListRow } from '@railway-latency/types';
import type { ReactNode } from 'react';

export const GRID_COLUMNS =
  '7rem 4.5rem minmax(0, 1fr) minmax(0, 1fr) 3.5rem 4rem minmax(0, 8rem) 5rem 5rem';

type FilterFn = (field: string, value: string) => void;

function Empty() {
  return (
    <Box as="span" color="fg.subtle">
      ·
    </Box>
  );
}

function FilterCell({
  children,
  color,
  field,
  onFilter,
  truncate,
  value,
}: {
  children: ReactNode;
  color?: string;
  field: string;
  onFilter: FilterFn;
  truncate?: boolean;
  value: string;
}) {
  if (!value) {
    return (
      <Box color={color ?? 'fg.muted'} truncate={truncate}>
        <Empty />
      </Box>
    );
  }
  return (
    <chakra.button
      type="button"
      justifySelf="start"
      maxWidth="100%"
      textAlign="left"
      truncate={truncate}
      color={color ?? 'fg'}
      _hover={{ color: 'accent', textDecoration: 'underline' }}
      onClick={(event) => {
        event.stopPropagation();
        onFilter(field, value);
      }}
    >
      {children}
    </chakra.button>
  );
}

function StatusCell({ onFilter, row }: { onFilter: FilterFn; row: CheckEventListRow }) {
  const status = checkStatusLabel({
    failStage: row.fail_stage,
    httpStatus: row.http_status,
  });
  const color = STATUS_TONE_COLOR[status.tone];
  const filter = row.fail_stage
    ? { field: 'fail', value: row.fail_stage.toLowerCase() }
    : row.http_status != null
      ? { field: 'status', value: String(row.http_status) }
      : null;

  if (!filter) {
    return (
      <Box color={color} fontWeight="medium" truncate>
        {status.text}
      </Box>
    );
  }

  return (
    <chakra.button
      type="button"
      justifySelf="start"
      maxWidth="100%"
      textAlign="left"
      truncate
      color={color}
      fontWeight="medium"
      _hover={{ textDecoration: 'underline' }}
      onClick={(event) => {
        event.stopPropagation();
        onFilter(filter.field, filter.value);
      }}
    >
      {status.text}
    </chakra.button>
  );
}

export const CheckHeaderRow = memo(function CheckHeaderRow() {
  return (
    <Box
      display="grid"
      gridTemplateColumns={GRID_COLUMNS}
      gap="3"
      paddingY="1.5"
      paddingX="2"
      color="fg.subtle"
      fontSize="2xs"
      fontWeight="semibold"
      textTransform="uppercase"
      letterSpacing="0.06em"
      borderBottomWidth="1px"
      borderColor="border.muted"
      position="sticky"
      top="0"
      zIndex="1"
      bg="bg"
    >
      <Box>Time</Box>
      <Box>Net</Box>
      <Box>Src</Box>
      <Box>Dst</Box>
      <Box>Status</Box>
      <Box textAlign="right">ms</Box>
      <Box>Edge</Box>
      <Box>Hikari</Box>
      <Box>CF</Box>
    </Box>
  );
});

export const CheckRow = memo(function CheckRow({
  onFilter,
  onSelect,
  row,
  rowKey,
  selected,
}: {
  row: CheckEventListRow;
  rowKey: string;
  selected: boolean;
  onFilter: FilterFn;
  onSelect: (key: string) => void;
}) {
  const date = new Date(row.time);
  const time = `${date.toLocaleTimeString(undefined, { hour12: false })}.${String(
    date.getMilliseconds(),
  ).padStart(3, '0')}`;
  const ms = row.http_ms ?? row.handshake_ms ?? row.dns_ms;
  const edge = row.railway_edge.replace(/^railway\//, '');

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onSelect(rowKey)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(rowKey);
        }
      }}
      cursor="pointer"
      width="100%"
      display="grid"
      gridTemplateColumns={GRID_COLUMNS}
      gap="3"
      paddingY="1"
      paddingX="2"
      fontFamily="mono"
      fontSize="xs"
      borderBottomWidth="1px"
      borderColor="border.muted"
      bg={selected ? 'accent.subtle' : undefined}
      transition="background 0.1s ease"
      _hover={{ bg: selected ? 'accent.subtle' : 'bg.emphasized' }}
    >
      <Box color="fg.muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {time}
      </Box>
      <FilterCell
        field="network"
        value={row.network}
        onFilter={onFilter}
        color="fg.muted"
      >
        {row.network}
      </FilterCell>
      <FilterCell field="src" value={row.src} onFilter={onFilter} truncate>
        {row.src}
      </FilterCell>
      <FilterCell field="dst" value={row.dst} onFilter={onFilter} truncate>
        {row.dst}
      </FilterCell>
      <StatusCell row={row} onFilter={onFilter} />
      <Box textAlign="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {ms == null ? <Empty /> : Math.round(ms)}
      </Box>
      <FilterCell
        field="edge"
        value={row.railway_edge}
        onFilter={onFilter}
        color="fg.muted"
        truncate
      >
        {edge}
      </FilterCell>
      <FilterCell
        field="hikari"
        value={row.hikari_pop}
        onFilter={onFilter}
        color="fg.muted"
        truncate
      >
        {row.hikari_pop}
      </FilterCell>
      <FilterCell
        field="cf"
        value={row.cf_pop}
        onFilter={onFilter}
        color="fg.muted"
        truncate
      >
        {row.cf_pop}
      </FilterCell>
    </Box>
  );
});
