import { HStack, Text } from '@chakra-ui/react';
import { KeyRound } from 'lucide-react';

import { AddAdminKeyDrawer } from '@/components/admin/AddAdminKeyDrawer';
import { AdminEntriesPage } from '@/components/admin/AdminEntriesPage';
import { useAdminKeys, useDeleteAdminKey } from '@/lib/queries';

import type { AdminKey } from '@railway-latency/types';

function PublicKeyCell({ publicKey }: { publicKey: string }) {
  const [keyType, ...rest] = publicKey.split(/\s+/);
  const body = rest.join(' ');

  return (
    <HStack
      align="baseline"
      gap="1.5"
      maxWidth="md"
      fontFamily="mono"
      textStyle="sm"
    >
      <Text as="span" flexShrink={0}>
        {keyType}
      </Text>
      <Text as="span" truncate color="fg.muted">
        {body}
      </Text>
    </HStack>
  );
}

export default function AdminKeysPage() {
  const adminKeys = useAdminKeys();
  const deleteAdminKey = useDeleteAdminKey();

  return (
    <AdminEntriesPage<AdminKey>
      entries={adminKeys}
      deleteEntry={deleteAdminKey}
      icon={<KeyRound />}
      note="These public keys form the fleet-wide authorized_keys set. Adding or removing one applies to every probe on the next Ansible converge."
      valueColumnLabel="Public key"
      renderValue={(entry) => <PublicKeyCell publicKey={entry.publicKey} />}
      getId={(entry) => entry.id}
      getLabel={(entry) => entry.label}
      getEnabled={(entry) => entry.enabled}
      getCreatedAt={(entry) => entry.createdAt}
      emptyTitle="No admin keys yet"
      emptyDescription="Add an SSH public key to grant fleet-wide login on the next converge."
      errorTitle="Couldn't load admin keys"
      addLabel="Add key"
      deleteTitle="Remove admin key"
      deleteBody={(entry) => (
        <Text textStyle="sm" color="fg.muted">
          <Text as="span" fontWeight="medium" color="fg">
            {entry.label}
          </Text>{' '}
          will be removed from every probe&apos;s authorized_keys on the next
          converge.
        </Text>
      )}
      renderAddDrawer={(open, onClose) => (
        <AddAdminKeyDrawer open={open} onClose={onClose} />
      )}
    />
  );
}
