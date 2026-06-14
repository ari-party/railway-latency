import { Drawer as ChakraDrawer, CloseButton, Portal } from '@chakra-ui/react';

import type { ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function Drawer({
  children,
  description,
  footer,
  onClose,
  open,
  title,
}: DrawerProps) {
  return (
    <ChakraDrawer.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="md"
    >
      <Portal>
        <ChakraDrawer.Backdrop />
        <ChakraDrawer.Positioner>
          <ChakraDrawer.Content>
            <ChakraDrawer.Header>
              <ChakraDrawer.Title>{title}</ChakraDrawer.Title>
              {description && (
                <ChakraDrawer.Description>
                  {description}
                </ChakraDrawer.Description>
              )}
            </ChakraDrawer.Header>

            <ChakraDrawer.Body>{children}</ChakraDrawer.Body>

            {footer && <ChakraDrawer.Footer>{footer}</ChakraDrawer.Footer>}

            <ChakraDrawer.CloseTrigger asChild>
              <CloseButton size="sm" />
            </ChakraDrawer.CloseTrigger>
          </ChakraDrawer.Content>
        </ChakraDrawer.Positioner>
      </Portal>
    </ChakraDrawer.Root>
  );
}
