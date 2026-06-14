import { EmptyState as ChakraEmptyState, VStack } from '@chakra-ui/react';

import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}

export function EmptyState({
  children,
  description,
  icon,
  title,
}: EmptyStateProps) {
  return (
    <ChakraEmptyState.Root>
      <ChakraEmptyState.Content>
        {icon && (
          <ChakraEmptyState.Indicator>{icon}</ChakraEmptyState.Indicator>
        )}
        <VStack textAlign="center">
          <ChakraEmptyState.Title>{title}</ChakraEmptyState.Title>
          {description && (
            <ChakraEmptyState.Description>
              {description}
            </ChakraEmptyState.Description>
          )}
        </VStack>
        {children}
      </ChakraEmptyState.Content>
    </ChakraEmptyState.Root>
  );
}
