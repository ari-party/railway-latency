import { Button, Center, Stack, Text } from '@chakra-ui/react';
import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <Center height="100svh">
        <Stack align="center" gap={4}>
          <Text color="fg.muted">Something went wrong.</Text>
          <Button onClick={this.handleReload}>Reload</Button>
        </Stack>
      </Center>
    );
  }
}
