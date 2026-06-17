import { describe, expect, it } from 'vitest';

import { parseCheckQuery } from '@/utils/checkQuery';

describe('parseCheckQuery', () => {
  it('parses equality and comparison status tokens', () => {
    expect(parseCheckQuery('@status:503').status).toEqual({
      op: 'eq',
      value: 503,
    });
    expect(parseCheckQuery('@status:>=400').status).toEqual({
      op: 'gte',
      value: 400,
    });
    expect(parseCheckQuery('@status:<500').status).toEqual({
      op: 'lt',
      value: 500,
    });
  });

  it('parses routing and identity tokens', () => {
    const filters = parseCheckQuery(
      '@network:public @src:probe-iad @dst:europe-west4 @edge:iad @cf:SJC @hikari:sin',
    );
    expect(filters).toMatchObject({
      network: 'public',
      src: 'probe-iad',
      dst: 'europe-west4',
      edge: 'iad',
      cf: 'SJC',
      hikari: 'sin',
    });
  });

  it('parses fail stage and has:body', () => {
    expect(parseCheckQuery('@fail:dns').failStage).toBe('dns');
    expect(parseCheckQuery('@has:body').hasBody).toBe(true);
  });

  it('collects free text outside tokens', () => {
    expect(parseCheckQuery('upstream connect @network:public').text).toBe(
      'upstream connect',
    );
  });

  it('ignores incomplete field tokens instead of treating them as free text', () => {
    expect(parseCheckQuery('@src:').text).toBeUndefined();
    expect(parseCheckQuery('@network').text).toBeUndefined();
    expect(parseCheckQuery('@status:400 @src:')).toEqual(
      parseCheckQuery('@status:400'),
    );
  });

  it('ignores invalid tokens instead of throwing', () => {
    expect(() =>
      parseCheckQuery('@status:abc @network:moon @bogus:1'),
    ).not.toThrow();
    const filters = parseCheckQuery('@status:abc @network:moon');
    expect(filters.status).toBeUndefined();
    expect(filters.network).toBeUndefined();
  });
});
