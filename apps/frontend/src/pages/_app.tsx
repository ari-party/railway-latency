import { Center, Spinner } from '@chakra-ui/react';
import Head from 'next/head';
import { NuqsAdapter } from 'nuqs/adapters/next/pages';
import React, { Suspense } from 'react';

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
            <Suspense
              fallback={
                <Center height="100svh">
                  <Spinner />
                </Center>
              }
            >
              <Component {...pageProps} />
            </Suspense>
          </NuqsAdapter>
        </ErrorBoundary>
      </ChakraProvider>
    </>
  );
}

export default trpc.withTRPC(App);
