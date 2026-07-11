import {
  Box,
  Button,
  createListCollection,
  HStack,
  Text,
} from '@chakra-ui/react';
import React from 'react';
import { LuPlay } from 'react-icons/lu';

import SimpleSelect from '@/components/select';

import type {
  GlobalpingLocationSelection,
  GlobalpingType,
  LocationTree,
} from '@/server/api/trpc/routers/globalping/types';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fontSize="2xs"
      fontWeight="semibold"
      letterSpacing="0.07em"
      textTransform="uppercase"
      color="fg.subtle"
      whiteSpace="nowrap"
    >
      {children}
    </Text>
  );
}

export interface GlobalpingControlsValue {
  type: GlobalpingType;
  dst: string;
  location: GlobalpingLocationSelection;
  limit: number;
}

export function GlobalpingControls({
  onChange,
  onRun,
  regions,
  running,
  tree,
  value,
}: {
  regions: string[];
  tree: LocationTree;
  value: GlobalpingControlsValue;
  onChange: (next: GlobalpingControlsValue) => void;
  onRun: () => void;
  running: boolean;
}) {
  const continent = tree.continents.find(
    (c) => c.code === value.location.continent,
  );
  const country = continent?.countries.find(
    (c) => c.code === value.location.country,
  );

  const typeCollection = createListCollection({
    items: [
      { value: 'http', label: 'HTTP' },
      { value: 'mtr', label: 'MTR' },
    ],
  });
  const dstCollection = createListCollection({
    items: regions.map((slug) => ({ value: slug, label: slug })),
  });
  const continentCollection = createListCollection({
    items: tree.continents.map((c) => ({
      value: c.code,
      label: `${c.name} (${c.probeCount})`,
    })),
  });
  const countryCollection = createListCollection({
    items: (continent?.countries ?? []).map((c) => ({
      value: c.code,
      label: `${c.code} (${c.probeCount})`,
    })),
  });
  const cityCollection = createListCollection({
    items: (country?.cities ?? []).map((c) => ({
      value: c.name,
      label: `${c.name} (${c.probeCount})`,
    })),
  });
  const countCollection = createListCollection({
    items: [5, 10, 20, 50].map((count) => ({
      value: String(count),
      label: String(count),
    })),
  });

  const canRun =
    !running && Boolean(value.dst) && Boolean(value.location.continent);

  return (
    <Box
      position="sticky"
      top="0"
      zIndex="docked"
      bg="bg.subtle"
      borderBottomWidth="1px"
      borderColor="border.muted"
      paddingX="6"
      paddingY="3"
    >
      <HStack gap="3" align="center" flexWrap="wrap">
        <HStack gap="2">
          <FieldLabel>Type</FieldLabel>
          <SimpleSelect
            width="120px"
            collection={typeCollection}
            value={[value.type]}
            onValueChange={(details) =>
              onChange({ ...value, type: details.value[0] as GlobalpingType })
            }
          />
        </HStack>

        <HStack gap="2">
          <FieldLabel>Dst</FieldLabel>
          <SimpleSelect
            width="220px"
            collection={dstCollection}
            value={value.dst ? [value.dst] : []}
            onValueChange={(details) =>
              onChange({ ...value, dst: details.value[0] })
            }
          />
        </HStack>

        <HStack gap="2">
          <FieldLabel>Continent</FieldLabel>
          <SimpleSelect
            width="180px"
            collection={continentCollection}
            value={value.location.continent ? [value.location.continent] : []}
            onValueChange={(details) =>
              onChange({ ...value, location: { continent: details.value[0] } })
            }
          />
        </HStack>

        <HStack gap="2">
          <FieldLabel>Country</FieldLabel>
          <SimpleSelect
            width="140px"
            collection={countryCollection}
            disabled={!continent}
            value={value.location.country ? [value.location.country] : []}
            onValueChange={(details) =>
              onChange({
                ...value,
                location: {
                  continent: value.location.continent,
                  country: details.value[0],
                },
              })
            }
          />
        </HStack>

        <HStack gap="2">
          <FieldLabel>City</FieldLabel>
          <SimpleSelect
            width="180px"
            collection={cityCollection}
            disabled={!country}
            value={value.location.city ? [value.location.city] : []}
            onValueChange={(details) =>
              onChange({
                ...value,
                location: {
                  continent: value.location.continent,
                  country: value.location.country,
                  city: details.value[0],
                },
              })
            }
          />
        </HStack>

        <HStack gap="2">
          <FieldLabel>Probes</FieldLabel>
          <SimpleSelect
            width="90px"
            collection={countCollection}
            value={[String(value.limit)]}
            onValueChange={(details) =>
              onChange({ ...value, limit: Number(details.value[0]) })
            }
          />
        </HStack>

        <Button
          size="sm"
          colorPalette="purple"
          disabled={!canRun}
          onClick={onRun}
          loading={running}
        >
          <LuPlay />
          Run
        </Button>
      </HStack>
    </Box>
  );
}
