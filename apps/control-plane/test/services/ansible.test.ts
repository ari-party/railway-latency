import '../helpers/db';

import { describe, expect, it } from 'vitest';

import { buildArgs } from '@/services/ansible';

function groupVarsArg(args: string[]): string | undefined {
  return args.find(
    (arg) => arg.startsWith('@') && /group_vars[\\/]all\.yml$/.test(arg),
  );
}

describe('ansible buildArgs', () => {
  it('limits to one probe and pins probe_sha on an update run', () => {
    const args = buildArgs({
      probeId: 'europe-ovh-fra1',
      playbook: 'converge',
      probeSha: 'abc1234',
    });
    expect(args).toContain('--limit');
    expect(args).toContain('europe-ovh-fra1');
    expect(args).toContain('-e');
    expect(args).toContain('probe_sha=abc1234');
  });

  it('omits probe_sha when not given', () => {
    const args = buildArgs({
      probeId: 'europe-ovh-fra1',
      playbook: 'teardown',
    });
    expect(args).not.toContain('probe_sha=');
  });

  it('passes the rendered group_vars explicitly on a converge run', () => {
    const args = buildArgs({
      probeId: 'europe-ovh-fra1',
      playbook: 'converge',
    });
    const extraVars = groupVarsArg(args);
    expect(extraVars).toBeDefined();
    expect(args[args.indexOf(extraVars as string) - 1]).toBe('-e');
  });

  it('passes the rendered group_vars explicitly on a teardown run', () => {
    const args = buildArgs({
      probeId: 'europe-ovh-fra1',
      playbook: 'teardown',
    });
    expect(groupVarsArg(args)).toBeDefined();
  });
});
