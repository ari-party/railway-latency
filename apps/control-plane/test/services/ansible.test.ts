import '../helpers/db';

import { describe, expect, it } from 'vitest';

import { buildArgs } from '@/services/ansible';

const GROUP_VARS_PATH = '/dev/shm/fleet-abc/group_vars.yml';

describe('ansible buildArgs', () => {
  it('limits to one probe and pins probe_sha on an update run', () => {
    const args = buildArgs(
      { probeId: 'europe-ovh-fra1', playbook: 'converge', probeSha: 'abc1234' },
      GROUP_VARS_PATH,
    );
    expect(args).toContain('--limit');
    expect(args).toContain('europe-ovh-fra1');
    expect(args).toContain('probe_sha=abc1234');
  });

  it('omits probe_sha when not given', () => {
    const args = buildArgs(
      { probeId: 'europe-ovh-fra1', playbook: 'teardown' },
      GROUP_VARS_PATH,
    );
    expect(args).not.toContain('probe_sha=');
  });

  it('passes the run-specific group vars file as extra vars', () => {
    const args = buildArgs(
      { probeId: 'europe-ovh-fra1', playbook: 'converge' },
      GROUP_VARS_PATH,
    );
    expect(args[args.indexOf(`@${GROUP_VARS_PATH}`) - 1]).toBe('-e');
  });
});
