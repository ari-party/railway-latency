import { describe, expect, it } from 'vitest';

import { buildLocationTree, toGlobalpingLocation } from './locations';

const probes = [
  { continent: 'EU', country: 'DE', city: 'Berlin' },
  { continent: 'EU', country: 'DE', city: 'Berlin' },
  { continent: 'EU', country: 'DE', city: 'Munich' },
  { continent: 'EU', country: 'FR', city: 'Paris' },
  { continent: 'NA', country: 'US', city: 'Ashburn' },
  { continent: 'EU', country: '', city: '' },
];

describe('buildLocationTree', () => {
  it('groups continent → country → city with counts', () => {
    const tree = buildLocationTree(probes);
    const eu = tree.continents.find((c) => c.code === 'EU');
    expect(eu?.name).toBe('Europe');
    expect(eu?.probeCount).toBe(4);
    const de = eu?.countries.find((c) => c.code === 'DE');
    expect(de?.probeCount).toBe(3);
    expect(de?.cities).toEqual([
      { name: 'Berlin', probeCount: 2 },
      { name: 'Munich', probeCount: 1 },
    ]);
  });

  it('skips probes with a missing continent/country/city', () => {
    const tree = buildLocationTree(probes);
    const eu = tree.continents.find((c) => c.code === 'EU');
    const totalEu = eu?.countries.reduce((n, c) => n + c.probeCount, 0);
    expect(totalEu).toBe(4);
  });

  it('sorts continents by display name', () => {
    const tree = buildLocationTree(probes);
    expect(tree.continents.map((c) => c.code)).toEqual(['EU', 'NA']);
  });
});

describe('toGlobalpingLocation', () => {
  it('prefers the most specific field', () => {
    expect(
      toGlobalpingLocation({ continent: 'EU', country: 'DE', city: 'Berlin' }),
    ).toEqual({
      city: 'Berlin',
      country: 'DE',
    });
    expect(toGlobalpingLocation({ continent: 'EU', country: 'DE' })).toEqual({
      country: 'DE',
    });
    expect(toGlobalpingLocation({ continent: 'EU' })).toEqual({
      continent: 'EU',
    });
    expect(toGlobalpingLocation({})).toEqual({});
  });
});
