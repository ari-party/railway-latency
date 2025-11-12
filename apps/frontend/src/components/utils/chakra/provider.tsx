'use client';

import {
  ChakraProvider,
  createSystem,
  defaultConfig,
  defineConfig,
} from '@chakra-ui/react';
import { GeistMono } from 'geist/font/mono';
import React from 'react';

import { ColorModeProvider } from '@/components/ui/color-mode';

import { recipes, slotRecipes } from './recipes';

import type { ColorModeProviderProps } from '@/components/ui/color-mode';

const config = defineConfig({
  globalCss: {
    '*': {
      scrollBehavior: 'smooth',
      _scrollbar: {
        width: '8px',
      },
      _scrollbarThumb: {
        backgroundColor: 'fg.subtle',
      },
      _scrollbarTrack: {
        backgroundColor: 'bg.subtle',
      },
    },
    '*::selection': {
      backgroundColor: 'blue.600/60',
    },
  },
  theme: {
    tokens: {
      fonts: {
        // GeistMono.style.fontFamily has fallback
        heading: {
          value: GeistMono.style.fontFamily,
        },
        body: {
          value: GeistMono.style.fontFamily,
        },
        mono: {
          value: GeistMono.style.fontFamily,
        },
      },
    },
    recipes,
    slotRecipes,
  },
});

export const system = createSystem(defaultConfig, config);

export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider forcedTheme="dark" {...props} />
    </ChakraProvider>
  );
}
