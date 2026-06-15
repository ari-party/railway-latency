import { Center, Spinner } from '@chakra-ui/react';
import Head from 'next/head';
import { NuqsAdapter } from 'nuqs/adapters/next/pages';
import React, { Suspense } from 'react';

import { AppShell } from '@/components/layout/appShell';
import { ChakraProvider } from '@/components/utils/chakra';
import { ErrorBoundary } from '@/components/utils/errorBoundary';
import { trpc } from '@/utils/trpc';

import type { AppProps } from 'next/app';

export function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Railway Latency</title>
      </Head>

      <ChakraProvider>
        <ErrorBoundary>
          <NuqsAdapter>
            <AppShell>
              <Suspense
                fallback={
                  <Center height="100%">
                    <Spinner />
                  </Center>
                }
              >
                <Component {...pageProps} />
              </Suspense>
            </AppShell>
          </NuqsAdapter>
        </ErrorBoundary>
      </ChakraProvider>
    </>
  );
}

export default trpc.withTRPC(App);
