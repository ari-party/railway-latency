import {
  Combobox,
  Stack,
  Text,
  useFilter,
  useListCollection,
} from '@chakra-ui/react';
import { CITIES } from '@railway-latency/utils';

import type { City } from '@railway-latency/utils';

const CITY_BY_CODE = new Map(CITIES.map((city) => [city.code, city]));

interface CitySelectProps {
  onSelect: (city: City) => void;
  disabled?: boolean;
}

export function CitySelect({ disabled, onSelect }: CitySelectProps) {
  const { contains } = useFilter({ sensitivity: 'base' });

  const { collection, filter } = useListCollection({
    initialItems: CITIES,
    filter: contains,
    itemToString: (city) => city.label,
    itemToValue: (city) => city.code,
  });

  return (
    <Stack gap="1">
      <Combobox.Root
        size="sm"
        disabled={disabled}
        collection={collection}
        onInputValueChange={(details) => filter(details.inputValue)}
        onValueChange={(details) => {
          const city = CITY_BY_CODE.get(details.value[0]);
          if (city) onSelect(city);
        }}
      >
        <Combobox.Label>Autofill from city</Combobox.Label>
        <Combobox.Control>
          <Combobox.Input placeholder="Search a city…" />
          <Combobox.IndicatorGroup>
            <Combobox.Trigger />
          </Combobox.IndicatorGroup>
        </Combobox.Control>
        <Combobox.Positioner>
          <Combobox.Content>
            <Combobox.Empty>No cities found</Combobox.Empty>
            {collection.items.slice(0, 50).map((city) => (
              <Combobox.Item item={city} key={city.code}>
                <Combobox.ItemText>{city.label}</Combobox.ItemText>
                <Combobox.ItemIndicator />
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>

      <Text textStyle="xs" color="fg.muted">
        Fills the ID, latitude and longitude. Replace “cloud” with the provider.
      </Text>
    </Stack>
  );
}
