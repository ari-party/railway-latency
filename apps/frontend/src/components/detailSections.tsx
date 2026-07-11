import { Box, HStack, Stack, Text } from '@chakra-ui/react';

export function DetailCard({ children }: { children: React.ReactNode }) {
  return (
    <Box
      borderWidth="1px"
      borderColor="border.DEFAULT"
      borderRadius="xl"
      bg="bg.panel"
      padding="4"
    >
      {children}
    </Box>
  );
}

export function DetailSection({
  children,
  label,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Text
        color="fg.subtle"
        fontSize="2xs"
        fontWeight="semibold"
        letterSpacing="0.07em"
        marginBottom="1.5"
        textTransform="uppercase"
      >
        {label}
      </Text>
      {children}
    </Box>
  );
}

export function TimingLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      width="5rem"
      flexShrink={0}
      fontSize="2xs"
      fontWeight="semibold"
      letterSpacing="0.07em"
      textTransform="uppercase"
      color="fg.subtle"
    >
      {children}
    </Text>
  );
}

export function TimingValue({
  color = 'fg',
  ms,
}: {
  color?: string;
  ms: number | null;
}) {
  return (
    <Text
      width="3.5rem"
      flexShrink={0}
      textAlign="right"
      fontFamily="mono"
      fontSize="xs"
      color={color}
      css={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {ms == null ? '..' : Math.round(ms)}
    </Text>
  );
}

export function WaterfallRow({
  color,
  label,
  ms,
  start,
  total,
}: {
  color: string;
  label: string;
  ms: number | null;
  start: number;
  total: number;
}) {
  const left = total > 0 ? (start / total) * 100 : 0;
  const width = total > 0 && ms ? (ms / total) * 100 : 0;

  return (
    <HStack gap="3">
      <TimingLabel>{label}</TimingLabel>
      <Box flex="1" position="relative" height="7px">
        <Box
          position="absolute"
          inset="0"
          borderRadius="full"
          bg="bg.emphasized"
        />
        {width > 0 && (
          <Box
            position="absolute"
            top="0"
            bottom="0"
            left={`${left}%`}
            width={`max(${width}%, 3px)`}
            borderRadius="full"
            bg={color}
          />
        )}
      </Box>
      <TimingValue ms={ms} />
    </HStack>
  );
}

export function HeaderList({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);

  return (
    <Stack fontFamily="mono" gap="0.5">
      {entries.length === 0 && (
        <Text color="fg.muted">No response headers captured.</Text>
      )}
      {entries.map(([name, value]) => (
        <Text key={name}>
          <Text as="span" color="accent">
            {name}
          </Text>
          : {value}
        </Text>
      ))}
    </Stack>
  );
}
