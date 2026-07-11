import { Box, Link, Stack, Text } from '@chakra-ui/react';

import type { MtrHop } from '@railway-latency/types';

const GRID_COLUMNS = '2.5rem minmax(0, 1fr) 4.5rem';

function HeaderRow() {
  return (
    <Box
      display="grid"
      gridTemplateColumns={GRID_COLUMNS}
      gap="3"
      paddingBottom="2"
      borderBottomWidth="1px"
      borderColor="border.muted"
    >
      <Text
        fontSize="2xs"
        textTransform="uppercase"
        letterSpacing="0.06em"
        color="fg.subtle"
      >
        Hop
      </Text>
      <Text
        fontSize="2xs"
        textTransform="uppercase"
        letterSpacing="0.06em"
        color="fg.subtle"
      >
        IP
      </Text>
      <Text
        fontSize="2xs"
        textTransform="uppercase"
        letterSpacing="0.06em"
        color="fg.subtle"
        textAlign="right"
      >
        Latency
      </Text>
    </Box>
  );
}

function HopRow({ hop }: { hop: MtrHop }) {
  return (
    <Box
      display="grid"
      gridTemplateColumns={GRID_COLUMNS}
      gap="3"
      alignItems="center"
      paddingY="1"
    >
      <Text
        fontFamily="mono"
        color="fg.subtle"
        css={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {hop.hop}
      </Text>

      {hop.ip == null ? (
        <Text fontFamily="mono" color="fg.subtle">
          *
        </Text>
      ) : (
        <Link
          href={`https://bgp.tools/prefix/${hop.ip}`}
          target="_blank"
          rel="noopener noreferrer"
          fontFamily="mono"
          color="fg"
          textDecoration="none"
          _hover={{ textDecoration: 'underline', color: 'accent' }}
        >
          {hop.ip}
        </Link>
      )}

      <Text
        textAlign="right"
        fontFamily="mono"
        css={{ fontVariantNumeric: 'tabular-nums' }}
        color={hop.ms == null ? 'fg.subtle' : 'fg'}
      >
        {hop.ms == null ? '..' : `${hop.ms.toFixed(1)} ms`}
      </Text>
    </Box>
  );
}

function Hop0Row({ asn }: { asn: string }) {
  const asnNumber = asn.match(/^(?:AS)?(\d+)/)?.[1] ?? null;

  return (
    <Box
      display="grid"
      gridTemplateColumns={GRID_COLUMNS}
      gap="3"
      alignItems="center"
      paddingY="1"
    >
      <Text
        fontFamily="mono"
        color="fg.subtle"
        css={{ fontVariantNumeric: 'tabular-nums' }}
      >
        0
      </Text>

      {asnNumber ? (
        <Link
          href={`https://bgp.tools/as/${asnNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          fontFamily="mono"
          color="fg"
          textDecoration="none"
          _hover={{ textDecoration: 'underline', color: 'accent' }}
        >
          {asn}
        </Link>
      ) : (
        <Text fontFamily="mono" color="fg">
          {asn}
        </Text>
      )}

      <Text textAlign="right" fontFamily="mono" color="fg.subtle">
        —
      </Text>
    </Box>
  );
}

export function MtrHopTable({
  hops,
  sourceAsn,
}: {
  hops: MtrHop[];
  sourceAsn?: string | null;
}) {
  return (
    <Stack gap="1">
      <HeaderRow />

      {sourceAsn && <Hop0Row asn={sourceAsn} />}

      {hops.map((hop, index) => (
        <HopRow key={`${index}-${hop.hop}`} hop={hop} />
      ))}
    </Stack>
  );
}
