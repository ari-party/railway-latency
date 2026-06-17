import { Box, Text } from '@chakra-ui/react';

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
      borderWidth="1px"
      borderColor="border.DEFAULT"
      borderRadius="xl"
      bg="bg.panel"
      paddingX="4"
      paddingY="3"
      marginY="3"
    >
      <Text
        fontSize="2xs"
        fontWeight="semibold"
        letterSpacing="0.07em"
        textTransform="uppercase"
        color="fg.subtle"
        marginBottom="2"
      >
        Latency
        <Box as="span" fontFamily="mono" color="fg.muted" marginLeft="2">
          {src} → {dst}
        </Box>
      </Text>
      <Box height="120px">
        <QueryChart dst={dst} network={network} range={range} src={src} />
      </Box>
    </Box>
  );
}
