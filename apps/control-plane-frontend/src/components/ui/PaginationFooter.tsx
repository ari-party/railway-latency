import { HStack, IconButton, NativeSelect, Pagination } from '@chakra-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationFooterProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function PaginationFooter({
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  totalCount,
}: PaginationFooterProps) {
  return (
    <Pagination.Root
      count={totalCount}
      page={page}
      pageSize={pageSize}
      onPageChange={(details) => onPageChange(details.page)}
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap="4"
      borderTopWidth="1px"
      px="4"
      py="2.5"
    >
      <Pagination.PageText format="long" textStyle="xs" color="fg.muted" />

      <HStack gap="2">
        <Pagination.PrevTrigger asChild>
          <IconButton
            size="xs"
            variant="outline"
            colorPalette="gray"
            aria-label="Previous page"
          >
            <ChevronLeft />
          </IconButton>
        </Pagination.PrevTrigger>

        <Pagination.PageText format="compact" textStyle="xs" color="fg.muted" />

        <Pagination.NextTrigger asChild>
          <IconButton
            size="xs"
            variant="outline"
            colorPalette="gray"
            aria-label="Next page"
          >
            <ChevronRight />
          </IconButton>
        </Pagination.NextTrigger>

        <NativeSelect.Root size="xs" width="auto">
          <NativeSelect.Field
            aria-label="Rows per page"
            value={String(pageSize)}
            onChange={(event) =>
              onPageSizeChange(Number(event.currentTarget.value))
            }
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </HStack>
    </Pagination.Root>
  );
}
