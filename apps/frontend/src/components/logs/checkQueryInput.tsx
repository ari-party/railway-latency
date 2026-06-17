import { Box, chakra, Input, Text } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import { LuSearch } from 'react-icons/lu';

import { QUERY_FIELDS } from '@/utils/checkQuery';
import { trpc } from '@/utils/trpc';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

const STATIC_VALUES: Record<string, string[]> = {
  network: ['private', 'public', 'proxied'],
  fail: ['dns', 'handshake', 'http'],
  has: ['body'],
};

interface Suggestion {
  insert: string;
  label: string;
  hint?: string;
  isValue: boolean;
}

export function CheckQueryInput({
  onChange,
  value,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { data: regions } = trpc.regions.useQuery();

  const activeToken = value.split(/\s+/).pop() ?? '';
  const fieldMatch = activeToken.match(/^@([a-z]+):(.*)$/i);

  let suggestions: Suggestion[] = [];
  if (fieldMatch) {
    const field = fieldMatch[1].toLowerCase();
    const partial = fieldMatch[2].toLowerCase();
    const candidates =
      field === 'src' || field === 'dst'
        ? (regions ?? [])
        : (STATIC_VALUES[field] ?? []);
    suggestions = candidates
      .filter((candidate) => candidate.toLowerCase().includes(partial))
      .map((candidate) => ({
        insert: `@${field}:${candidate}`,
        label: candidate,
        hint: field,
        isValue: true,
      }));
  } else if (activeToken === '' || activeToken.startsWith('@')) {
    const needle = activeToken.startsWith('@')
      ? activeToken.slice(1).toLowerCase()
      : '';
    suggestions = QUERY_FIELDS.filter((field) =>
      field.token.slice(1).toLowerCase().includes(needle),
    ).map((field) => ({
      insert: `${field.token}:`,
      label: field.token,
      hint: field.hint,
      isValue: false,
    }));
  }

  const showDropdown = open && suggestions.length > 0;

  useEffect(() => {
    if (!showDropdown || activeIndex < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, showDropdown]);

  function applySuggestion(suggestion: Suggestion) {
    const suffix = suggestion.isValue ? ' ' : '';
    onChange(
      value.replace(
        /(^|\s)\S*$/,
        (_full, prefix) => `${prefix}${suggestion.insert}${suffix}`,
      ),
    );
    setActiveIndex(-1);
    setOpen(true);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!showDropdown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, -1));
    } else if (event.key === 'Enter') {
      // Enter only applies a suggestion the user explicitly arrowed to;
      // otherwise it dismisses the dropdown so the typed query stands.
      if (activeIndex < 0) {
        setOpen(false);
        return;
      }
      event.preventDefault();
      applySuggestion(suggestions[activeIndex]);
    } else if (event.key === 'Tab' && activeIndex >= 0) {
      event.preventDefault();
      applySuggestion(suggestions[activeIndex]);
    }
  }

  return (
    <Box position="relative" flex="1">
      <Box
        position="absolute"
        left="3"
        top="50%"
        transform="translateY(-50%)"
        color="fg.subtle"
        pointerEvents="none"
        zIndex="1"
      >
        <LuSearch size={15} />
      </Box>
      <Input
        ref={inputRef}
        fontFamily="mono"
        fontSize="sm"
        paddingLeft="9"
        bg="bg"
        borderColor="border.DEFAULT"
        borderRadius="md"
        _placeholder={{ color: 'fg.subtle' }}
        _focusVisible={{ borderColor: 'accent', boxShadow: 'none' }}
        placeholder="@status:>=400 @network:public @dst:… free text"
        value={value}
        onChange={(event) => {
          setActiveIndex(-1);
          onChange(event.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {showDropdown && (
        <Box
          position="absolute"
          top="100%"
          left="0"
          right="0"
          zIndex="dropdown"
          marginTop="1"
          display="flex"
          flexDirection="column"
          maxHeight="20rem"
          bg="bg.panel"
          borderWidth="1px"
          borderColor="border.DEFAULT"
          borderRadius="md"
          boxShadow="0 12px 32px rgba(0, 0, 0, 0.5)"
          overflow="hidden"
        >
          <Box ref={listRef} overflowY="auto" paddingY="1">
            {suggestions.map((suggestion, index) => {
              const active = index === activeIndex;
              return (
                <chakra.button
                  key={suggestion.insert}
                  type="button"
                  data-index={index}
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  gap="3"
                  width="100%"
                  textAlign="left"
                  paddingX="3"
                  paddingY="1.5"
                  bg={active ? 'accent.subtle' : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySuggestion(suggestion);
                  }}
                >
                  <Text
                    as="span"
                    fontFamily="mono"
                    fontSize="sm"
                    color={
                      active ? 'accent' : suggestion.isValue ? 'fg' : 'accent'
                    }
                    truncate
                  >
                    {suggestion.label}
                  </Text>
                  {suggestion.hint && (
                    <Text
                      as="span"
                      color="fg.subtle"
                      fontSize="xs"
                      flexShrink={0}
                      truncate
                    >
                      {suggestion.hint}
                    </Text>
                  )}
                </chakra.button>
              );
            })}
          </Box>
          <Box
            borderTopWidth="1px"
            borderColor="border.muted"
            paddingX="3"
            paddingY="1.5"
            color="fg.subtle"
            fontSize="2xs"
          >
            ↑↓ navigate · ↵ select · esc dismiss
          </Box>
        </Box>
      )}
    </Box>
  );
}
