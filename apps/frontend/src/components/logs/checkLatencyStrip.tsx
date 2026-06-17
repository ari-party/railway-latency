import { Box } from '@chakra-ui/react';

import { QueryChart } from '@/components/queryChart';

import type { FrontendRange } from '@/utils/query';
import type { Network } from '@railway-latency/types';

export function CheckLatencyStrip({
  dst,
  network,
  range,
  src,
}: {
  src: string;
  dst: string;
  network: Network;
  range: FrontendRange;
}) {
  return (
    <Box
      borderBottomWidth="1px"
      borderColor="border.muted"
      height="120px"
      marginBottom="2"
    >
      <QueryChart dst={dst} network={network} range={range} src={src} />
    </Box>
  );
}
