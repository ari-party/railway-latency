import { Box, chakra, Input, Text } from '@chakra-ui/react';
import { useRef, useState } from 'react';

import { QUERY_FIELDS } from '@/utils/checkQuery';
import { trpc } from '@/utils/trpc';

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
  const inputRef = useRef<HTMLInputElement>(null);
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

  function applySuggestion(suggestion: Suggestion) {
    const suffix = suggestion.isValue ? ' ' : '';
    onChange(
      value.replace(
        /(^|\s)\S*$/,
        (_full, prefix) => `${prefix}${suggestion.insert}${suffix}`,
      ),
    );
    setOpen(true);
    inputRef.current?.focus();
  }

  return (
    <Box position="relative" flex="1">
      <Input
        ref={inputRef}
        fontFamily="mono"
        fontSize="sm"
        placeholder="@status:>=400 @network:public @dst:… free text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      {showDropdown && (
        <Box
          position="absolute"
          top="100%"
          left="0"
          right="0"
          zIndex="dropdown"
          marginTop="1"
          maxHeight="18rem"
          overflowY="auto"
          bg="bg.panel"
          borderWidth="1px"
          borderColor="border.muted"
          borderRadius="md"
          boxShadow="lg"
          paddingY="1"
        >
          {suggestions.map((suggestion) => (
            <chakra.button
              key={suggestion.insert}
              type="button"
              display="block"
              width="100%"
              textAlign="left"
              paddingX="3"
              paddingY="1.5"
              _hover={{ bg: 'bg.emphasized' }}
              onMouseDown={(event) => {
                event.preventDefault();
                applySuggestion(suggestion);
              }}
            >
              <Text as="span" fontFamily="mono" color="accent">
                {suggestion.label}
              </Text>
              {suggestion.hint && (
                <Text as="span" color="fg.muted" fontSize="xs" marginLeft="2">
                  {suggestion.hint}
                </Text>
              )}
            </chakra.button>
          ))}
        </Box>
      )}
    </Box>
  );
}
