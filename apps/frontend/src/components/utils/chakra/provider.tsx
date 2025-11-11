'use client';

import {
  ChakraProvider,
  createSystem,
  defaultConfig,
  defineConfig,
} from '@chakra-ui/react';
import React from 'react';

import { ColorModeProvider } from '@/components/ui/color-mode';

import type { ColorModeProviderProps } from '@/components/ui/color-mode';

const config = defineConfig({});

export const system = createSystem(defaultConfig, config);

export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider forcedTheme="dark" {...props} />
    </ChakraProvider>
  );
}
