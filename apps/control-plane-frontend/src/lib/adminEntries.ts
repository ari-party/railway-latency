const SSH_PUBLIC_KEY_PATTERN =
  /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-[a-z0-9-]+) AAAA[0-9A-Za-z+/]+={0,3}(\s.*)?$/;

export function isSshPublicKey(value: string): boolean {
  return SSH_PUBLIC_KEY_PATTERN.test(value.trim());
}

export interface AdminKeyFormValues {
  label: string;
  publicKey: string;
}

export const EMPTY_ADMIN_KEY_FORM: AdminKeyFormValues = {
  label: '',
  publicKey: '',
};

export type AdminKeyFormErrors = Partial<
  Record<keyof AdminKeyFormValues, string>
>;

export function validateAdminKeyForm(
  values: AdminKeyFormValues,
): AdminKeyFormErrors {
  const errors: AdminKeyFormErrors = {};

  if (values.label.trim() === '') errors.label = 'Required.';

  if (values.publicKey.trim() === '') {
    errors.publicKey = 'Required.';
  } else if (!isSshPublicKey(values.publicKey)) {
    errors.publicKey =
      'Must be an SSH public key (ssh-ed25519, ssh-rsa or ecdsa-sha2-… AAAA…).';
  }

  return errors;
}
