import citiesData from '@/cities.data.json';

export interface City {
  code: string;
  label: string;
  continent: string;
  lat: number;
  lon: number;
}

export const CITIES = citiesData as City[];

const CITY_BY_CODE = new Map(CITIES.map((city) => [city.code, city]));

export function cityFromCode(code: string): City | undefined {
  return CITY_BY_CODE.get(code.toLowerCase());
}

export function cityNameFromProbeId(probeId: string): string | null {
  const lastSegment = probeId.split('-').pop() ?? '';
  const code = lastSegment.replace(/\d+$/, '');
  return cityFromCode(code)?.label ?? null;
}
