export type CheckStatusOperator = 'eq' | 'gte' | 'lte' | 'gt' | 'lt';

export type CheckCondition =
  | { field: 'network'; value: string }
  | { field: 'src'; value: string }
  | { field: 'dst'; value: string }
  | { field: 'edge'; value: string }
  | { field: 'cf'; value: string }
  | { field: 'hikari'; value: string }
  | { field: 'failStage'; value: string }
  | { field: 'status'; op: CheckStatusOperator; value: number }
  | { field: 'hasBody' }
  | { field: 'text'; value: string };

export type CheckQueryNode =
  | { kind: 'and'; children: CheckQueryNode[] }
  | { kind: 'or'; children: CheckQueryNode[] }
  | { kind: 'condition'; condition: CheckCondition };

const STATUS_RE = /^(>=|<=|>|<)?(\d{3})$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const NETWORKS = new Set(['private', 'public', 'proxied']);
const FAIL_STAGES = new Set(['dns', 'handshake', 'http']);
const STATUS_OPERATORS: Record<string, CheckStatusOperator> = {
  '>=': 'gte',
  '<=': 'lte',
  '>': 'gt',
  '<': 'lt',
};

const EMPTY: CheckQueryNode = { kind: 'and', children: [] };

function isEmpty(node: CheckQueryNode): boolean {
  return (
    (node.kind === 'and' || node.kind === 'or') && node.children.length === 0
  );
}

function parseStatus(
  raw: string,
): { op: CheckStatusOperator; value: number } | null {
  const match = raw.match(STATUS_RE);
  if (!match) return null;
  return {
    op: STATUS_OPERATORS[match[1] ?? ''] ?? 'eq',
    value: Number(match[2]),
  };
}

// Returns null for incomplete/invalid `@` tokens so they are dropped, not
// matched as free text.
function conditionFromTerm(raw: string): CheckCondition | null {
  if (raw.startsWith('@')) {
    const match = raw.match(/^@([a-z]+):(.+)$/i);
    if (!match) return null;
    const field = match[1].toLowerCase();
    const value = match[2];
    switch (field) {
      case 'status': {
        const status = parseStatus(value);
        return status ? { field: 'status', ...status } : null;
      }
      case 'fail':
        return FAIL_STAGES.has(value) ? { field: 'failStage', value } : null;
      case 'network':
        return NETWORKS.has(value) ? { field: 'network', value } : null;
      case 'src':
        return SLUG_RE.test(value) ? { field: 'src', value } : null;
      case 'dst':
        return SLUG_RE.test(value) ? { field: 'dst', value } : null;
      case 'edge':
        return { field: 'edge', value };
      case 'cf':
        return { field: 'cf', value };
      case 'hikari':
        return { field: 'hikari', value };
      case 'has':
        return value === 'body' ? { field: 'hasBody' } : null;
      default:
        return null;
    }
  }
  return { field: 'text', value: raw };
}

type Token =
  | { t: 'lparen' }
  | { t: 'rparen' }
  | { t: 'and' }
  | { t: 'or' }
  | { t: 'term'; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ t: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ t: 'rparen' });
      i += 1;
      continue;
    }
    let j = i;
    while (j < input.length && !' \t\n\r()'.includes(input[j])) j += 1;
    const word = input.slice(i, j);
    i = j;
    const upper = word.toUpperCase();
    if (upper === 'AND') tokens.push({ t: 'and' });
    else if (upper === 'OR') tokens.push({ t: 'or' });
    else tokens.push({ t: 'term', value: word });
  }
  return tokens;
}

function flatten(kind: 'and' | 'or', parts: CheckQueryNode[]): CheckQueryNode {
  const children: CheckQueryNode[] = [];
  for (const part of parts) {
    if (isEmpty(part)) continue;
    if (part.kind === kind) children.push(...part.children);
    else children.push(part);
  }
  if (children.length === 0) return EMPTY;
  if (children.length === 1) return children[0];
  return { kind, children };
}

// Recursive descent: OR binds loosest, AND tighter (explicit `AND` and
// adjacency both mean AND), parentheses group. Invalid terms are dropped.
class CheckQueryParser {
  private readonly tokens: Token[];

  private position = 0;

  constructor(input: string) {
    this.tokens = tokenize(input);
  }

  parse(): CheckQueryNode {
    return this.parseOr();
  }

  private parseOr(): CheckQueryNode {
    const parts = [this.parseAnd()];
    while (this.tokens[this.position]?.t === 'or') {
      this.position += 1;
      parts.push(this.parseAnd());
    }
    return flatten('or', parts);
  }

  private parseAnd(): CheckQueryNode {
    const parts: CheckQueryNode[] = [];
    while (this.position < this.tokens.length) {
      const token = this.tokens[this.position];
      if (token.t === 'rparen' || token.t === 'or') break;
      if (token.t === 'and') {
        this.position += 1;
        continue;
      }
      parts.push(this.parseTerm());
    }
    return flatten('and', parts);
  }

  private parseTerm(): CheckQueryNode {
    const token = this.tokens[this.position];
    if (token.t === 'lparen') {
      this.position += 1;
      const node = this.parseOr();
      if (this.tokens[this.position]?.t === 'rparen') this.position += 1;
      return node;
    }
    if (token.t === 'term') {
      this.position += 1;
      const condition = conditionFromTerm(token.value);
      return condition ? { kind: 'condition', condition } : EMPTY;
    }
    this.position += 1;
    return EMPTY;
  }
}

export function parseCheckQuery(input: string): CheckQueryNode {
  return new CheckQueryParser(input).parse();
}

export function checkQueryScansBody(node: CheckQueryNode): boolean {
  if (node.kind === 'condition')
    return (
      node.condition.field === 'text' || node.condition.field === 'hasBody'
    );
  return node.children.some(checkQueryScansBody);
}

const STATUS_OPERATOR_SQL: Record<CheckStatusOperator, string> = {
  eq: '=',
  gte: '>=',
  lte: '<=',
  gt: '>',
  lt: '<',
};

const COLUMN: Record<string, string> = {
  network: 'network',
  src: 'src',
  dst: 'dst',
  edge: 'railway_edge',
  cf: 'cf_pop',
  hikari: 'hikari_pop',
  failStage: 'fail_stage',
};

// Returns the WHERE fragment (null when the query is empty) plus the bound
// params: values are always parameters, never inlined, since the query is
// built from an untrusted string.
export function compileCheckQuery(node: CheckQueryNode): {
  sql: string | null;
  params: Record<string, unknown>;
} {
  const params: Record<string, unknown> = {};
  let index = 0;

  function bind(value: unknown, type: string): string {
    const key = `f${index}`;
    index += 1;
    params[key] = value;
    return `{${key}:${type}}`;
  }

  function compileCondition(condition: CheckCondition): string {
    switch (condition.field) {
      case 'status':
        return `http_status ${STATUS_OPERATOR_SQL[condition.op]} ${bind(condition.value, 'UInt16')}`;
      case 'hasBody':
        return "body != ''";
      case 'text': {
        const placeholder = bind(condition.value, 'String');
        return `(positionCaseInsensitive(reason, ${placeholder}) > 0 OR positionCaseInsensitive(body, ${placeholder}) > 0)`;
      }
      default:
        return `${COLUMN[condition.field]} = ${bind(condition.value, 'String')}`;
    }
  }

  function compileNode(current: CheckQueryNode): string | null {
    if (current.kind === 'condition')
      return compileCondition(current.condition);

    const parts = current.children
      .map(compileNode)
      .filter((part): part is string => part != null);

    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    return `(${parts.join(current.kind === 'and' ? ' AND ' : ' OR ')})`;
  }

  return { sql: compileNode(node), params };
}
