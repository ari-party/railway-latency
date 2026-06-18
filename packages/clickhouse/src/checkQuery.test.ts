import { describe, expect, it } from 'vitest';

import {
  checkQueryScansBody,
  compileCheckQuery,
  parseCheckQuery,
} from '@/checkQuery';

function compile(input: string) {
  return compileCheckQuery(parseCheckQuery(input));
}

describe('parseCheckQuery', () => {
  it('returns an empty AND node for blank input', () => {
    expect(parseCheckQuery('')).toEqual({ kind: 'and', children: [] });
    expect(parseCheckQuery('   ')).toEqual({ kind: 'and', children: [] });
  });

  it('treats adjacency as AND', () => {
    expect(parseCheckQuery('@network:public @fail:dns')).toEqual({
      kind: 'and',
      children: [
        { kind: 'condition', condition: { field: 'network', value: 'public' } },
        { kind: 'condition', condition: { field: 'failStage', value: 'dns' } },
      ],
    });
  });

  it('parses an explicit OR', () => {
    expect(parseCheckQuery('@fail:dns OR @fail:http')).toEqual({
      kind: 'or',
      children: [
        { kind: 'condition', condition: { field: 'failStage', value: 'dns' } },
        { kind: 'condition', condition: { field: 'failStage', value: 'http' } },
      ],
    });
  });

  it('binds OR looser than AND', () => {
    expect(parseCheckQuery('@network:public @fail:dns OR @fail:http')).toEqual({
      kind: 'or',
      children: [
        {
          kind: 'and',
          children: [
            {
              kind: 'condition',
              condition: { field: 'network', value: 'public' },
            },
            {
              kind: 'condition',
              condition: { field: 'failStage', value: 'dns' },
            },
          ],
        },
        { kind: 'condition', condition: { field: 'failStage', value: 'http' } },
      ],
    });
  });

  it('groups with parentheses', () => {
    expect(
      parseCheckQuery('@network:public AND (@fail:dns OR @fail:http)'),
    ).toEqual({
      kind: 'and',
      children: [
        { kind: 'condition', condition: { field: 'network', value: 'public' } },
        {
          kind: 'or',
          children: [
            {
              kind: 'condition',
              condition: { field: 'failStage', value: 'dns' },
            },
            {
              kind: 'condition',
              condition: { field: 'failStage', value: 'http' },
            },
          ],
        },
      ],
    });
  });

  it('drops invalid field tokens but keeps the rest', () => {
    expect(parseCheckQuery('@status:99 @network:public')).toEqual({
      kind: 'condition',
      condition: { field: 'network', value: 'public' },
    });
  });

  it('treats a bare word as free text', () => {
    expect(parseCheckQuery('timeout')).toEqual({
      kind: 'condition',
      condition: { field: 'text', value: 'timeout' },
    });
  });

  it('ANDs adjacent free-text words', () => {
    expect(parseCheckQuery('connection timeout')).toEqual({
      kind: 'and',
      children: [
        {
          kind: 'condition',
          condition: { field: 'text', value: 'connection' },
        },
        { kind: 'condition', condition: { field: 'text', value: 'timeout' } },
      ],
    });
  });

  it('parses a status comparison operator', () => {
    expect(parseCheckQuery('@status:>=500')).toEqual({
      kind: 'condition',
      condition: { field: 'status', op: 'gte', value: 500 },
    });
  });

  it('tolerates an unbalanced opening parenthesis', () => {
    expect(parseCheckQuery('(@network:public')).toEqual({
      kind: 'condition',
      condition: { field: 'network', value: 'public' },
    });
  });

  it('tolerates an unbalanced closing parenthesis', () => {
    expect(parseCheckQuery('@network:public )')).toEqual({
      kind: 'condition',
      condition: { field: 'network', value: 'public' },
    });
  });
});

describe('compileCheckQuery', () => {
  it('returns null for an empty query and binds nothing', () => {
    const { sql, params } = compileCheckQuery(parseCheckQuery(''));
    expect(sql).toBeNull();
    expect(params).toEqual({});
  });

  it('binds values as parameters, never inlining them', () => {
    const { sql, params } = compile('@network:public @status:>=500');
    expect(sql).toBe('(network = {f0:String} AND http_status >= {f1:UInt16})');
    expect(params).toEqual({ f0: 'public', f1: 500 });
  });

  it('nests groups to preserve OR/AND precedence', () => {
    const { sql } = compile('@network:public @fail:dns OR @fail:http');
    expect(sql).toBe(
      '((network = {f0:String} AND fail_stage = {f1:String}) OR fail_stage = {f2:String})',
    );
  });

  it('searches both reason and body for free text', () => {
    const { sql, params } = compile('upstream');
    expect(sql).toBe(
      '(positionCaseInsensitive(reason, {f0:String}) > 0 OR positionCaseInsensitive(body, {f0:String}) > 0)',
    );
    expect(params).toEqual({ f0: 'upstream' });
  });

  it('compiles has:body without binding a parameter', () => {
    const { sql, params } = compile('@has:body');
    expect(sql).toBe("body != ''");
    expect(params).toEqual({});
  });
});

describe('checkQueryScansBody', () => {
  it('is true when free text is present', () => {
    expect(checkQueryScansBody(parseCheckQuery('upstream'))).toBe(true);
  });

  it('is true when has:body appears in a nested branch', () => {
    expect(
      checkQueryScansBody(parseCheckQuery('@network:public OR @has:body')),
    ).toBe(true);
  });

  it('is false for field-only queries', () => {
    expect(
      checkQueryScansBody(parseCheckQuery('@network:public @status:500')),
    ).toBe(false);
  });

  it('is false for an empty query', () => {
    expect(checkQueryScansBody(parseCheckQuery(''))).toBe(false);
  });
});
