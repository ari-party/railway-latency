import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Table,
  Text,
} from '@chakra-ui/react';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  ConfirmDialog,
  EmptyState,
  LoadingRows,
  PaginationFooter,
  Tooltip,
} from '@/components/ui';
import { fullTimestamp, relativeTime } from '@/lib/format';

import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

interface AdminEntriesPageProps<TEntry> {
  entries: UseQueryResult<TEntry[]>;
  deleteEntry: UseMutationResult<void, unknown, string>;
  icon: ReactNode;
  note: ReactNode;
  valueColumnLabel: string;
  renderValue: (entry: TEntry) => ReactNode;
  getId: (entry: TEntry) => string;
  getLabel: (entry: TEntry) => string;
  getEnabled: (entry: TEntry) => boolean;
  getCreatedAt: (entry: TEntry) => string;
  emptyTitle: string;
  emptyDescription: string;
  errorTitle: string;
  addLabel: string;
  deleteTitle: string;
  deleteBody: (entry: TEntry) => ReactNode;
  renderAddDrawer: (open: boolean, onClose: () => void) => ReactNode;
}

const DEFAULT_PAGE_SIZE = 25;

const COLUMN_COUNT = 5;

export function AdminEntriesPage<TEntry>({
  addLabel,
  deleteBody,
  deleteEntry,
  deleteTitle,
  emptyDescription,
  emptyTitle,
  entries,
  errorTitle,
  getCreatedAt,
  getEnabled,
  getId,
  getLabel,
  icon,
  note,
  renderAddDrawer,
  renderValue,
  valueColumnLabel,
}: AdminEntriesPageProps<TEntry>) {
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TEntry | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const list = entries.data ?? [];
  const totalCount = list.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  const currentPage = Math.min(page, pageCount);
  const pagedList = list.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteEntry.mutate(getId(pendingDelete), {
      onSuccess: () => setPendingDelete(null),
    });
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
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
          {entries.isLoading
            ? 'Loading…'
            : `${totalCount} entr${totalCount === 1 ? 'y' : 'ies'}`}
        </Text>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus />
          {addLabel}
        </Button>
      </Flex>

      {note && (
        <Text
          textStyle="xs"
          color="fg.muted"
          borderBottomWidth="1px"
          px="4"
          py="2.5"
        >
          {note}
        </Text>
      )}

      {entries.isError ? (
        <Box p="6">
          <EmptyState
            icon={icon}
            title={errorTitle}
            description="The control-plane request failed. Check that the API is reachable and retry."
          >
            <Button
              size="sm"
              variant="outline"
              colorPalette="gray"
              onClick={() => entries.refetch()}
            >
              Retry
            </Button>
          </EmptyState>
        </Box>
      ) : entries.isLoading ? (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Label</Table.ColumnHeader>
              <Table.ColumnHeader>{valueColumnLabel}</Table.ColumnHeader>
              <Table.ColumnHeader>Status</Table.ColumnHeader>
              <Table.ColumnHeader>Created</Table.ColumnHeader>
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
            icon={icon}
            title={emptyTitle}
            description={emptyDescription}
          >
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus />
              {addLabel}
            </Button>
          </EmptyState>
        </Box>
      ) : (
        <>
          <Table.Root size="sm" interactive>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Label</Table.ColumnHeader>
                <Table.ColumnHeader>{valueColumnLabel}</Table.ColumnHeader>
                <Table.ColumnHeader>Status</Table.ColumnHeader>
                <Table.ColumnHeader>Created</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Actions</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {pagedList.map((entry) => (
                <Table.Row key={getId(entry)}>
                  <Table.Cell>{getLabel(entry)}</Table.Cell>
                  <Table.Cell>{renderValue(entry)}</Table.Cell>
                  <Table.Cell>
                    {getEnabled(entry) ? (
                      <Badge variant="subtle" colorPalette="green">
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="subtle" colorPalette="gray">
                        Disabled
                      </Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell fontFamily="mono" color="fg.muted">
                    <Tooltip content={fullTimestamp(getCreatedAt(entry))}>
                      <Text as="span">{relativeTime(getCreatedAt(entry))}</Text>
                    </Tooltip>
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    <HStack justify="flex-end">
                      <IconButton
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        aria-label={`Delete ${getLabel(entry)}`}
                        onClick={() => setPendingDelete(entry)}
                      >
                        <Trash2 />
                      </IconButton>
                    </HStack>
                  </Table.Cell>
                </Table.Row>
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

      {renderAddDrawer(adding, () => setAdding(false))}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={deleteTitle}
        confirmLabel="Remove"
        pending={deleteEntry.isPending}
      >
        {pendingDelete && deleteBody(pendingDelete)}
      </ConfirmDialog>
    </>
  );
}
