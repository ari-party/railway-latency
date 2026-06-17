import { Box, chakra } from '@chakra-ui/react';

import { checkStatusLabel } from '@/components/logs/checkStatus';

import type { CheckEventListRow } from '@railway-latency/types';

export const GRID_COLUMNS =
  '7rem 4.5rem minmax(0, 1fr) minmax(0, 1fr) 3.5rem 4rem minmax(0, 8rem) 5rem 5rem';

const TONE_COLOR = { ok: 'status.green', error: 'red.400' } as const;

export function CheckHeaderRow() {
  return (
    <Box
      display="grid"
      gridTemplateColumns={GRID_COLUMNS}
      gap="3"
      paddingY="1.5"
      paddingX="2"
      color="fg.muted"
      fontSize="2xs"
      textTransform="uppercase"
      letterSpacing="wide"
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
}

export function CheckRow({
  onSelect,
  row,
  selected,
}: {
  row: CheckEventListRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = checkStatusLabel({
    failStage: row.fail_stage,
    httpStatus: row.http_status,
  });
  const time = new Date(row.time).toISOString().slice(11, 23);
  const ms = row.http_ms ?? row.handshake_ms ?? row.dns_ms;
  const edge = row.railway_edge.replace(/^railway\//, '');

  return (
    <chakra.button
      type="button"
      onClick={onSelect}
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
      _hover={{ bg: selected ? 'accent.subtle' : 'bg.emphasized' }}
    >
      <Box color="fg.muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {time}
      </Box>
      <Box color="fg.muted">{row.network}</Box>
      <Box truncate>{row.src}</Box>
      <Box truncate>{row.dst}</Box>
      <Box color={TONE_COLOR[status.tone]} fontWeight="medium">
        {status.text}
      </Box>
      <Box textAlign="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {ms == null ? '—' : Math.round(ms)}
      </Box>
      <Box color="fg.muted" truncate>
        {edge || '—'}
      </Box>
      <Box color="fg.muted" truncate>
        {row.hikari_pop || '—'}
      </Box>
      <Box color="fg.muted" truncate>
        {row.cf_pop || '—'}
      </Box>
    </chakra.button>
  );
}
