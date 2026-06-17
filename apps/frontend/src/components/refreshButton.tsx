import { IconButton } from '@chakra-ui/react';
import React from 'react';
import { LuRefreshCw } from 'react-icons/lu';

export function RefreshButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <IconButton
      size="sm"
      variant="ghost"
      aria-label="Refresh"
      color="fg.muted"
      bg="bg.subtle"
      borderWidth="1px"
      borderColor="border.DEFAULT"
      borderRadius="md"
      disabled={disabled}
      transition="color 0.15s ease, background 0.15s ease, border-color 0.15s ease"
      _hover={{
        bg: 'bg.emphasized',
        color: 'accent',
        borderColor: 'border.emphasized',
      }}
      onClick={onClick}
    >
      <LuRefreshCw />
    </IconButton>
  );
}
