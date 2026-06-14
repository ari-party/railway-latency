import { Box, Clipboard, Code, IconButton } from '@chakra-ui/react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  label?: string;
}

export function CodeBlock({ code, label }: CodeBlockProps) {
  return (
    <Box
      position="relative"
      overflow="hidden"
      borderWidth="1px"
      borderColor="border.emphasized"
      rounded="md"
      bg="bg"
    >
      {label && (
        <Box
          borderBottomWidth="1px"
          px="3"
          py="1.5"
          textStyle="xs"
          fontWeight="medium"
          textTransform="uppercase"
          letterSpacing="wide"
          color="fg.subtle"
        >
          {label}
        </Box>
      )}

      <Code
        display="block"
        overflowX="auto"
        whiteSpace="pre"
        bg="transparent"
        px="3"
        py="3"
        paddingEnd="16"
        textStyle="sm"
      >
        {code}
      </Code>

      <Clipboard.Root value={code} position="absolute" top="1.5" insetEnd="1.5">
        <Clipboard.Trigger asChild>
          <IconButton
            size="xs"
            variant="ghost"
            colorPalette="gray"
            aria-label="Copy to clipboard"
          >
            <Clipboard.Indicator copied={<Check />}>
              <Copy />
            </Clipboard.Indicator>
          </IconButton>
        </Clipboard.Trigger>
      </Clipboard.Root>
    </Box>
  );
}
