export interface City {
  code: string;
  label: string;
  continent: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  {
    code: 'jnb',
    label: 'Johannesburg',
    continent: 'af',
    lat: -26.2041,
    lon: 28.0473,
  },
  {
    code: 'cpt',
    label: 'Cape Town',
    continent: 'af',
    lat: -33.9249,
    lon: 18.4241,
  },
  { code: 'los', label: 'Lagos', continent: 'af', lat: 6.5244, lon: 3.3792 },
  {
    code: 'nbo',
    label: 'Nairobi',
    continent: 'af',
    lat: -1.2921,
    lon: 36.8219,
  },
  { code: 'cai', label: 'Cairo', continent: 'af', lat: 30.0444, lon: 31.2357 },
  {
    code: 'cmn',
    label: 'Casablanca',
    continent: 'af',
    lat: 33.5731,
    lon: -7.5898,
  },
  { code: 'acc', label: 'Accra', continent: 'af', lat: 5.6037, lon: -0.187 },
  { code: 'tun', label: 'Tunis', continent: 'af', lat: 36.8065, lon: 10.1815 },

  {
    code: 'sin',
    label: 'Singapore',
    continent: 'as',
    lat: 1.3521,
    lon: 103.8198,
  },
  { code: 'hnd', label: 'Tokyo', continent: 'as', lat: 35.6762, lon: 139.6503 },
  { code: 'kix', label: 'Osaka', continent: 'as', lat: 34.6937, lon: 135.5023 },
  { code: 'icn', label: 'Seoul', continent: 'as', lat: 37.5665, lon: 126.978 },
  {
    code: 'hkg',
    label: 'Hong Kong',
    continent: 'as',
    lat: 22.3193,
    lon: 114.1694,
  },
  { code: 'tpe', label: 'Taipei', continent: 'as', lat: 25.033, lon: 121.5654 },
  {
    code: 'pvg',
    label: 'Shanghai',
    continent: 'as',
    lat: 31.2304,
    lon: 121.4737,
  },
  {
    code: 'pek',
    label: 'Beijing',
    continent: 'as',
    lat: 39.9042,
    lon: 116.4074,
  },
  {
    code: 'bkk',
    label: 'Bangkok',
    continent: 'as',
    lat: 13.7563,
    lon: 100.5018,
  },
  {
    code: 'cgk',
    label: 'Jakarta',
    continent: 'as',
    lat: -6.2088,
    lon: 106.8456,
  },
  {
    code: 'kul',
    label: 'Kuala Lumpur',
    continent: 'as',
    lat: 3.139,
    lon: 101.6869,
  },
  {
    code: 'mnl',
    label: 'Manila',
    continent: 'as',
    lat: 14.5995,
    lon: 120.9842,
  },
  { code: 'bom', label: 'Mumbai', continent: 'as', lat: 19.076, lon: 72.8777 },
  { code: 'del', label: 'Delhi', continent: 'as', lat: 28.6139, lon: 77.209 },
  {
    code: 'blr',
    label: 'Bengaluru',
    continent: 'as',
    lat: 12.9716,
    lon: 77.5946,
  },
  {
    code: 'maa',
    label: 'Chennai',
    continent: 'as',
    lat: 13.0827,
    lon: 80.2707,
  },
  { code: 'dxb', label: 'Dubai', continent: 'as', lat: 25.2048, lon: 55.2708 },
  { code: 'ruh', label: 'Riyadh', continent: 'as', lat: 24.7136, lon: 46.6753 },
  {
    code: 'tlv',
    label: 'Tel Aviv',
    continent: 'as',
    lat: 32.0853,
    lon: 34.7818,
  },

  { code: 'lhr', label: 'London', continent: 'eu', lat: 51.5074, lon: -0.1278 },
  {
    code: 'fra',
    label: 'Frankfurt',
    continent: 'eu',
    lat: 50.1109,
    lon: 8.6821,
  },
  {
    code: 'ams',
    label: 'Amsterdam',
    continent: 'eu',
    lat: 52.3676,
    lon: 4.9041,
  },
  { code: 'cdg', label: 'Paris', continent: 'eu', lat: 48.8566, lon: 2.3522 },
  { code: 'mad', label: 'Madrid', continent: 'eu', lat: 40.4168, lon: -3.7038 },
  { code: 'lis', label: 'Lisbon', continent: 'eu', lat: 38.7223, lon: -9.1393 },
  { code: 'mxp', label: 'Milan', continent: 'eu', lat: 45.4642, lon: 9.19 },
  { code: 'zrh', label: 'Zurich', continent: 'eu', lat: 47.3769, lon: 8.5417 },
  { code: 'vie', label: 'Vienna', continent: 'eu', lat: 48.2082, lon: 16.3738 },
  { code: 'waw', label: 'Warsaw', continent: 'eu', lat: 52.2297, lon: 21.0122 },
  {
    code: 'arn',
    label: 'Stockholm',
    continent: 'eu',
    lat: 59.3293,
    lon: 18.0686,
  },
  {
    code: 'hel',
    label: 'Helsinki',
    continent: 'eu',
    lat: 60.1699,
    lon: 24.9384,
  },
  {
    code: 'cph',
    label: 'Copenhagen',
    continent: 'eu',
    lat: 55.6761,
    lon: 12.5683,
  },
  { code: 'osl', label: 'Oslo', continent: 'eu', lat: 59.9139, lon: 10.7522 },
  { code: 'dub', label: 'Dublin', continent: 'eu', lat: 53.3498, lon: -6.2603 },
  {
    code: 'ist',
    label: 'Istanbul',
    continent: 'eu',
    lat: 41.0082,
    lon: 28.9784,
  },

  {
    code: 'iad',
    label: 'Ashburn',
    continent: 'na',
    lat: 39.0438,
    lon: -77.4874,
  },
  {
    code: 'jfk',
    label: 'New York',
    continent: 'na',
    lat: 40.7128,
    lon: -74.006,
  },
  { code: 'atl', label: 'Atlanta', continent: 'na', lat: 33.749, lon: -84.388 },
  { code: 'mia', label: 'Miami', continent: 'na', lat: 25.7617, lon: -80.1918 },
  {
    code: 'ord',
    label: 'Chicago',
    continent: 'na',
    lat: 41.8781,
    lon: -87.6298,
  },
  { code: 'dfw', label: 'Dallas', continent: 'na', lat: 32.7767, lon: -96.797 },
  {
    code: 'sea',
    label: 'Seattle',
    continent: 'na',
    lat: 47.6062,
    lon: -122.3321,
  },
  {
    code: 'sfo',
    label: 'San Francisco',
    continent: 'na',
    lat: 37.7749,
    lon: -122.4194,
  },
  {
    code: 'lax',
    label: 'Los Angeles',
    continent: 'na',
    lat: 34.0522,
    lon: -118.2437,
  },
  {
    code: 'yyz',
    label: 'Toronto',
    continent: 'na',
    lat: 43.6532,
    lon: -79.3832,
  },
  {
    code: 'yul',
    label: 'Montreal',
    continent: 'na',
    lat: 45.5017,
    lon: -73.5673,
  },
  {
    code: 'mex',
    label: 'Mexico City',
    continent: 'na',
    lat: 19.4326,
    lon: -99.1332,
  },

  {
    code: 'gru',
    label: 'São Paulo',
    continent: 'sa',
    lat: -23.5505,
    lon: -46.6333,
  },
  {
    code: 'gig',
    label: 'Rio de Janeiro',
    continent: 'sa',
    lat: -22.9068,
    lon: -43.1729,
  },
  {
    code: 'eze',
    label: 'Buenos Aires',
    continent: 'sa',
    lat: -34.6037,
    lon: -58.3816,
  },
  {
    code: 'scl',
    label: 'Santiago',
    continent: 'sa',
    lat: -33.4489,
    lon: -70.6693,
  },
  { code: 'bog', label: 'Bogotá', continent: 'sa', lat: 4.711, lon: -74.0721 },
  { code: 'lim', label: 'Lima', continent: 'sa', lat: -12.0464, lon: -77.0428 },

  {
    code: 'syd',
    label: 'Sydney',
    continent: 'oc',
    lat: -33.8688,
    lon: 151.2093,
  },
  {
    code: 'mel',
    label: 'Melbourne',
    continent: 'oc',
    lat: -37.8136,
    lon: 144.9631,
  },
  {
    code: 'bne',
    label: 'Brisbane',
    continent: 'oc',
    lat: -27.4698,
    lon: 153.0251,
  },
  {
    code: 'per',
    label: 'Perth',
    continent: 'oc',
    lat: -31.9505,
    lon: 115.8605,
  },
  {
    code: 'akl',
    label: 'Auckland',
    continent: 'oc',
    lat: -36.8485,
    lon: 174.7633,
  },
];

const CITY_BY_CODE = new Map(CITIES.map((city) => [city.code, city]));

export function cityFromCode(code: string): City | undefined {
  return CITY_BY_CODE.get(code.toLowerCase());
}

export function cityNameFromProbeId(probeId: string): string | null {
  const lastSegment = probeId.split('-').pop() ?? '';
  const code = lastSegment.replace(/\d+$/, '');
  return cityFromCode(code)?.label ?? null;
}
