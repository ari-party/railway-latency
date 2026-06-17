import { Box, chakra } from '@chakra-ui/react';
import { memo } from 'react';

import { checkStatusLabel } from '@/components/logs/checkStatus';

import type { CheckEventListRow } from '@railway-latency/types';

export const GRID_COLUMNS =
  '7rem 4.5rem minmax(0, 1fr) minmax(0, 1fr) 3.5rem 4rem minmax(0, 8rem) 5rem 5rem';

const TONE = {
  ok: { color: 'status.green', bg: 'hsl(146, 64%, 50%, 0.13)' },
  error: { color: 'status.down', bg: 'hsl(2, 82%, 63%, 0.15)' },
} as const;

function Empty() {
  return (
    <Box as="span" color="fg.subtle">
      ·
    </Box>
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
  onSelect,
  row,
  rowKey,
  selected,
}: {
  row: CheckEventListRow;
  rowKey: string;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  const status = checkStatusLabel({
    failStage: row.fail_stage,
    httpStatus: row.http_status,
  });
  const tone = TONE[status.tone];
  const time = new Date(row.time).toISOString().slice(11, 23);
  const ms = row.http_ms ?? row.handshake_ms ?? row.dns_ms;
  const edge = row.railway_edge.replace(/^railway\//, '');

  return (
    <chakra.button
      type="button"
      onClick={() => onSelect(rowKey)}
      textAlign="left"
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
      boxShadow={selected ? 'inset 2px 0 0 0 var(--chakra-colors-accent)' : undefined}
      transition="background 0.1s ease"
      _hover={{ bg: selected ? 'accent.subtle' : 'bg.emphasized' }}
    >
      <Box color="fg.muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {time}
      </Box>
      <Box color="fg.muted">{row.network}</Box>
      <Box truncate>{row.src}</Box>
      <Box truncate>{row.dst}</Box>
      <Box
        as="span"
        justifySelf="start"
        paddingX="1.5"
        borderRadius="sm"
        fontWeight="medium"
        color={tone.color}
        bg={tone.bg}
      >
        {status.text}
      </Box>
      <Box textAlign="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {ms == null ? <Empty /> : Math.round(ms)}
      </Box>
      <Box color="fg.muted" truncate>
        {edge || <Empty />}
      </Box>
      <Box color="fg.muted" truncate>
        {row.hikari_pop || <Empty />}
      </Box>
      <Box color="fg.muted" truncate>
        {row.cf_pop || <Empty />}
      </Box>
    </chakra.button>
  );
});
