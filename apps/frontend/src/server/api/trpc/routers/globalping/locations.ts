import type { GlobalpingLocationSelection, LocationTree } from './types';

const CONTINENT_NAMES: Record<string, string> = {
  AF: 'Africa',
  AN: 'Antarctica',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'North America',
  OC: 'Oceania',
  SA: 'South America',
};

export function buildLocationTree(
  probes: ReadonlyArray<{ continent: string; country: string; city: string }>,
): LocationTree {
  const byContinent = new Map<string, Map<string, Map<string, number>>>();

  for (const probe of probes) {
    if (!probe.continent || !probe.country || !probe.city) continue;

    const countries = byContinent.get(probe.continent) ?? new Map();
    byContinent.set(probe.continent, countries);

    const cities = countries.get(probe.country) ?? new Map();
    countries.set(probe.country, cities);

    cities.set(probe.city, (cities.get(probe.city) ?? 0) + 1);
  }

  const continents = [...byContinent.entries()].map(([code, countries]) => {
    const countryList = [...countries.entries()].map(
      ([countryCode, cities]) => {
        const cityList = [...cities.entries()]
          .map(([name, probeCount]) => ({ name, probeCount }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const probeCount = cityList.reduce((n, city) => n + city.probeCount, 0);

        return { code: countryCode, probeCount, cities: cityList };
      },
    );

    countryList.sort((a, b) => a.code.localeCompare(b.code));

    const probeCount = countryList.reduce(
      (n, country) => n + country.probeCount,
      0,
    );

    return {
      code,
      name: CONTINENT_NAMES[code] ?? code,
      probeCount,
      countries: countryList,
    };
  });

  continents.sort((a, b) => a.name.localeCompare(b.name));

  return { continents };
}

export function toGlobalpingLocation(
  selection: GlobalpingLocationSelection,
): Record<string, string> {
  if (selection.city && selection.country)
    return { city: selection.city, country: selection.country };
  if (selection.country) return { country: selection.country };
  if (selection.continent) return { continent: selection.continent };
  return {};
}
