import {
  Box,
  Button,
  Combobox,
  createListCollection,
  HStack,
  Portal,
  Text,
} from '@chakra-ui/react';
import React from 'react';
import { LuChevronDown, LuPlay, LuX } from 'react-icons/lu';

import SimpleSelect from '@/components/select';

import type {
  GlobalpingLocationSelection,
  GlobalpingType,
  LocationTree,
} from '@/server/api/trpc/routers/globalping/types';

const regionDisplay = new Intl.DisplayNames(['en'], { type: 'region' });

function countryName(code: string): string {
  try {
    return regionDisplay.of(code) ?? code;
  } catch {
    return code;
  }
}

const TOP_PER_GROUP = 15;

interface LocationOption {
  value: string;
  label: string;
  primary: string;
  secondary?: string;
  group: 'Continents' | 'Countries' | 'Networks' | 'Cities';
  probeCount: number;
  selection: GlobalpingLocationSelection;
}

const GROUP_ORDER: LocationOption['group'][] = [
  'Continents',
  'Countries',
  'Cities',
  'Networks',
];

function locationValue(selection: GlobalpingLocationSelection): string {
  if (selection.network) return `network:${selection.network}`;
  if (selection.city && selection.country)
    return `city:${selection.country}:${selection.city}`;
  if (selection.country) return `country:${selection.country}`;
  if (selection.continent) return `continent:${selection.continent}`;
  return '';
}

function buildLocationOptions(tree: LocationTree): LocationOption[] {
  const options: LocationOption[] = [];

  for (const continent of tree.continents)
    options.push({
      value: `continent:${continent.code}`,
      label: continent.name,
      primary: continent.name,
      group: 'Continents',
      probeCount: continent.probeCount,
      selection: { continent: continent.code },
    });

  for (const continent of tree.continents)
    for (const country of continent.countries) {
      const name = countryName(country.code);
      options.push({
        value: `country:${country.code}`,
        label: `${name} (${country.code})`,
        primary: name,
        secondary: ` (${country.code})`,
        group: 'Countries',
        probeCount: country.probeCount,
        selection: { country: country.code },
      });
    }

  for (const network of tree.networks)
    options.push({
      value: `network:${network.name}`,
      label: network.name,
      primary: network.name,
      group: 'Networks',
      probeCount: network.probeCount,
      selection: { network: network.name },
    });

  for (const continent of tree.continents)
    for (const country of continent.countries)
      for (const city of country.cities) {
        const name = countryName(country.code);
        options.push({
          value: `city:${country.code}:${city.name}`,
          label: `${city.name}, ${name} (${country.code})`,
          primary: city.name,
          secondary: `, ${name} (${country.code})`,
          group: 'Cities',
          probeCount: city.probeCount,
          selection: { country: country.code, city: city.name },
        });
      }

  return options;
}

function LocationCombobox({
  onChange,
  tree,
  value,
}: {
  tree: LocationTree;
  value: GlobalpingLocationSelection;
  onChange: (next: GlobalpingLocationSelection) => void;
}) {
  const options = React.useMemo(() => buildLocationOptions(tree), [tree]);
  const [query, setQuery] = React.useState('');

  const groups = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return GROUP_ORDER.map((group) => {
      const items = options
        .filter(
          (option) =>
            option.group === group &&
            (!needle || option.label.toLowerCase().includes(needle)),
        )
        .sort((a, b) => b.probeCount - a.probeCount)
        .slice(0, TOP_PER_GROUP);
      return { group, items };
    }).filter((entry) => entry.items.length > 0);
  }, [options, query]);

  const collection = React.useMemo(
    () =>
      createListCollection<LocationOption>({
        items: groups.flatMap((entry) => entry.items),
      }),
    [groups],
  );

  const selected = locationValue(value);

  return (
    <Combobox.Root
      size="sm"
      width="280px"
      collection={collection}
      value={selected ? [selected] : []}
      onValueChange={(details) => onChange(details.items[0]?.selection ?? {})}
      onInputValueChange={(details) => setQuery(details.inputValue)}
      openOnClick
    >
      <Combobox.Control>
        <Combobox.Input
          placeholder="Enter location"
          bg="bg.subtle"
          borderColor="border.DEFAULT"
          borderRadius="md"
          fontFamily="mono"
          fontSize="sm"
          _hover={{ borderColor: 'border.emphasized' }}
          _focus={{ borderColor: 'accent' }}
        />
        <Combobox.IndicatorGroup>
          <Combobox.ClearTrigger>
            <LuX />
          </Combobox.ClearTrigger>
          <Combobox.Trigger>
            <LuChevronDown />
          </Combobox.Trigger>
        </Combobox.IndicatorGroup>
      </Combobox.Control>

      <Portal>
        <Combobox.Positioner>
          <Combobox.Content
            bg="bg.emphasized"
            borderWidth="1px"
            borderColor="border.DEFAULT"
            borderRadius="md"
            boxShadow="0 12px 32px rgba(0, 0, 0, 0.5)"
            maxHeight="360px"
            overflowY="auto"
          >
            <Combobox.Empty color="fg.muted" fontSize="sm">
              No matching locations
            </Combobox.Empty>

            {groups.map((entry) => (
              <Combobox.ItemGroup key={entry.group}>
                <Combobox.ItemGroupLabel
                  fontSize="2xs"
                  fontWeight="semibold"
                  letterSpacing="0.07em"
                  textTransform="uppercase"
                  color="fg.subtle"
                >
                  {entry.group}
                </Combobox.ItemGroupLabel>

                {entry.items.map((item) => (
                  <Combobox.Item
                    item={item}
                    key={item.value}
                    justifyContent="space-between"
                    fontFamily="mono"
                    fontSize="sm"
                    _hover={{ bg: 'bg.subtle' }}
                    _selected={{ color: 'accent' }}
                  >
                    <Combobox.ItemText>
                      {item.primary}
                      {item.secondary && (
                        <Text as="span" fontSize="xs" color="fg.muted">
                          {item.secondary}
                        </Text>
                      )}
                    </Combobox.ItemText>
                    <Text fontSize="xs" color="fg.subtle">
                      {item.probeCount}
                    </Text>
                  </Combobox.Item>
                ))}
              </Combobox.ItemGroup>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}

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
  const typeCollection = createListCollection({
    items: [
      { value: 'http', label: 'HTTP' },
      { value: 'mtr', label: 'MTR' },
    ],
  });
  const dstCollection = createListCollection({
    items: regions.map((slug) => ({ value: slug, label: slug })),
  });
  const countCollection = createListCollection({
    items: [5, 10, 20, 50].map((count) => ({
      value: String(count),
      label: String(count),
    })),
  });

  const hasLocation = Boolean(
    value.location.continent || value.location.country || value.location.city,
  );
  const canRun = !running && Boolean(value.dst) && hasLocation;

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
          <FieldLabel>Location</FieldLabel>
          <LocationCombobox
            tree={tree}
            value={value.location}
            onChange={(location) => onChange({ ...value, location })}
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
