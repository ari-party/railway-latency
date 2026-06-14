import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Head from 'next/head';
import { useState } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui';
import { ChakraProvider } from '@/components/utils/chakra';

import type { AppProps } from 'next/app';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10 * 1_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(createQueryClient);

  return (
    <>
      <Head>
        <title>Control Plane</title>
        <meta
          name="description"
          content="Probe fleet administration for railway-latency."
        />
      </Head>

      <ChakraProvider>
        <QueryClientProvider client={queryClient}>
          <AppShell>
            <Component {...pageProps} />
          </AppShell>
          <Toaster />
        </QueryClientProvider>
      </ChakraProvider>
    </>
  );
}
