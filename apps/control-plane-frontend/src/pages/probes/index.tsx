import { Box, Button, Flex, HStack, Table, Text } from '@chakra-ui/react';
import { Plus, Server } from 'lucide-react';
import { useState } from 'react';

import { CreateProbeDrawer } from '@/components/probes/CreateProbeDrawer';
import { ProbeActionDialogs } from '@/components/probes/ProbeActionDialogs';
import { ProbeProgressDialog } from '@/components/probes/ProbeProgressDialog';
import { ProbeRow } from '@/components/probes/ProbeRow';
import { EmptyState, LoadingRows, PaginationFooter } from '@/components/ui';
import { useLatestRelease, useProbes } from '@/lib/queries';

import type { ProbeAction } from '@/components/probes/ProbeActionDialogs';
import type { Probe } from '@railway-latency/types';

interface ActiveAction {
  probe: Probe;
  action: ProbeAction;
}

const DEFAULT_PAGE_SIZE = 25;

const COLUMN_COUNT = 6;

export default function ProbesPage() {
  const [creating, setCreating] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [expandedProbeId, setExpandedProbeId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const probes = useProbes({ fastPoll: updatingAll });
  const latestRelease = useLatestRelease();
  const latestSha = latestRelease.data?.sha ?? null;

  const list = probes.data ?? [];
  const totalCount = list.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  const currentPage = Math.min(page, pageCount);
  const pagedList = list.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
  }

  function toggleExpanded(probeId: string) {
    setExpandedProbeId((current) => (current === probeId ? null : probeId));
  }

  return (
    <>
      <Flex
        align="center"
        justify="space-between"
        borderBottomWidth="1px"
        px="4"
        py="3"
      >
        <Text textStyle="xs" color="fg.muted">
          {probes.isLoading
            ? 'Loading…'
            : `${totalCount} probe${totalCount === 1 ? '' : 's'}`}
        </Text>
        <HStack gap="2">
          <Button
            size="sm"
            variant="outline"
            colorPalette="gray"
            onClick={() => setUpdatingAll(true)}
          >
            Update all to latest
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            New probe
          </Button>
        </HStack>
      </Flex>

      {probes.isError ? (
        <Box p="6">
          <EmptyState
            icon={<Server />}
            title="Couldn't load probes"
            description="The control-plane request failed. Check that the API is reachable and retry."
          >
            <Button
              size="sm"
              variant="outline"
              colorPalette="gray"
              onClick={() => probes.refetch()}
            >
              Retry
            </Button>
          </EmptyState>
        </Box>
      ) : probes.isLoading ? (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Probe ID</Table.ColumnHeader>
              <Table.ColumnHeader>Status</Table.ColumnHeader>
              <Table.ColumnHeader>Deployed</Table.ColumnHeader>
              <Table.ColumnHeader>Host</Table.ColumnHeader>
              <Table.ColumnHeader>Last seen</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">Actions</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <LoadingRows columnCount={COLUMN_COUNT} />
          </Table.Body>
        </Table.Root>
      ) : list.length === 0 ? (
        <Box p="6">
          <EmptyState
            icon={<Server />}
            title="No probes yet"
            description="Enroll your first probe to start collecting external latency."
          >
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              New probe
            </Button>
          </EmptyState>
        </Box>
      ) : (
        <>
          <Table.Root size="sm" interactive>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Probe ID</Table.ColumnHeader>
                <Table.ColumnHeader>Status</Table.ColumnHeader>
                <Table.ColumnHeader>Deployed</Table.ColumnHeader>
                <Table.ColumnHeader>Host</Table.ColumnHeader>
                <Table.ColumnHeader>Last seen</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Actions</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {pagedList.map((probe) => (
                <ProbeRow
                  key={probe.probeId}
                  probe={probe}
                  latestSha={latestSha}
                  expanded={expandedProbeId === probe.probeId}
                  onToggle={toggleExpanded}
                  onAction={(target, action) =>
                    setActiveAction({ probe: target, action })
                  }
                />
              ))}
            </Table.Body>
          </Table.Root>

          <PaginationFooter
            page={currentPage}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}

      <CreateProbeDrawer open={creating} onClose={() => setCreating(false)} />

      {activeAction && (
        <ProbeActionDialogs
          probe={activeAction.probe}
          action={activeAction.action}
          latestSha={latestSha}
          onClose={() => setActiveAction(null)}
        />
      )}

      {updatingAll && (
        <ProbeProgressDialog
          latestSha={latestSha}
          onClose={() => setUpdatingAll(false)}
        />
      )}
    </>
  );
}
