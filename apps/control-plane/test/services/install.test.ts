import '../helpers/db';

import { describe, expect, it } from 'vitest';

import { installCommand, renderBootstrapScript } from '@/services/install';

describe('install service', () => {
  it('renders a one-liner targeting the public base url and token', () => {
    const command = installCommand('et_abc123');
    expect(command).toBe(
      'curl -fsSL https://cp.test.example.com/enroll/et_abc123/bootstrap.sh | sudo ET=et_abc123 bash',
    );
  });
});

describe('renderBootstrapScript', () => {
  const rendered = renderBootstrapScript({
    token: 'et_abc123',
    adminKeys: ['ssh-ed25519 AAAAadmin admin@laptop'],
    automationPublicKey: 'ssh-ed25519 AAAAauto fleet-automation',
    publicBaseUrl: 'https://cp.railwaylatency.com',
  });

  it('embeds only PUBLIC key material, never an API key', () => {
    expect(rendered).toContain('ssh-ed25519 AAAAadmin admin@laptop');
    expect(rendered).toContain('ssh-ed25519 AAAAauto fleet-automation');
    expect(rendered).not.toMatch(/\brl_/);
  });

  it('hardens sshd with the four required directives', () => {
    expect(rendered).toContain('PermitRootLogin prohibit-password');
    expect(rendered).toContain('PasswordAuthentication no');
    expect(rendered).toContain('PubkeyAuthentication yes');
    expect(rendered).toContain('KbdInteractiveAuthentication no');
  });

  it('calls home with the token in the Authorization header and an empty body', () => {
    expect(rendered).toContain('https://cp.railwaylatency.com/enroll/callhome');
    expect(rendered).toMatch(/Authorization: Bearer \$\{ET:-et_abc123\}/);
  });

  it('allows ssh from anywhere (ufw allow 22/tcp)', () => {
    expect(rendered).toContain('ufw allow 22/tcp');
    expect(rendered).not.toContain('ufw allow from');
  });
});
