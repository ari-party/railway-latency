import { Dialog as ChakraDialog, CloseButton, Portal } from '@chakra-ui/react';

import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function Dialog({
  children,
  description,
  footer,
  onClose,
  open,
  title,
}: DialogProps) {
  return (
    <ChakraDialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="sm"
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header flexDirection="column" gap="1">
              <ChakraDialog.Title>{title}</ChakraDialog.Title>
              {description && (
                <ChakraDialog.Description>
                  {description}
                </ChakraDialog.Description>
              )}
            </ChakraDialog.Header>

            <ChakraDialog.Body>{children}</ChakraDialog.Body>

            {footer && <ChakraDialog.Footer>{footer}</ChakraDialog.Footer>}

            <ChakraDialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </ChakraDialog.CloseTrigger>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}
