export type StatusOperator = 'eq' | 'gte' | 'lte' | 'gt' | 'lt';

export interface CheckQueryFilters {
  status?: { op: StatusOperator; value: number };
  failStage?: 'dns' | 'handshake' | 'http';
  network?: 'private' | 'public' | 'proxied';
  src?: string;
  dst?: string;
  edge?: string;
  cf?: string;
  hikari?: string;
  hasBody?: boolean;
  text?: string;
}

const NETWORKS = new Set(['private', 'public', 'proxied']);
const FAIL_STAGES = new Set(['dns', 'handshake', 'http']);
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function parseStatus(raw: string): CheckQueryFilters['status'] {
  const match = raw.match(/^(>=|<=|>|<)?(\d{3})$/);
  if (!match) return undefined;
  const value = parseInt(match[2], 10);
  const op =
    ({ '>=': 'gte', '<=': 'lte', '>': 'gt', '<': 'lt' } as const)[
      match[1] ?? ''
    ] ?? 'eq';
  return { op, value };
}

export function parseCheckQuery(input: string): CheckQueryFilters {
  const filters: CheckQueryFilters = {};
  const freeText: string[] = [];

  for (const token of input.trim().split(/\s+/).filter(Boolean)) {
    const tokenMatch = token.match(/^@([a-z]+):(.+)$/i);
    if (!tokenMatch) {
      freeText.push(token);
      continue;
    }
    const [, field, value] = tokenMatch;
    switch (field.toLowerCase()) {
      case 'status': {
        const status = parseStatus(value);
        if (status) filters.status = status;
        break;
      }
      case 'fail':
        if (FAIL_STAGES.has(value))
          filters.failStage = value as CheckQueryFilters['failStage'];
        break;
      case 'network':
        if (NETWORKS.has(value))
          filters.network = value as CheckQueryFilters['network'];
        break;
      case 'src':
        if (SLUG.test(value)) filters.src = value;
        break;
      case 'dst':
        if (SLUG.test(value)) filters.dst = value;
        break;
      case 'edge':
        filters.edge = value;
        break;
      case 'cf':
        filters.cf = value;
        break;
      case 'hikari':
        filters.hikari = value;
        break;
      case 'has':
        if (value === 'body') filters.hasBody = true;
        break;
      default:
        break;
    }
  }

  if (freeText.length > 0) filters.text = freeText.join(' ');
  return filters;
}
