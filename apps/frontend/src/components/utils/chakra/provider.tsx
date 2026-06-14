'use client';

import '@fontsource/inter';

import {
  ChakraProvider,
  createSystem,
  defaultConfig,
  defineConfig,
} from '@chakra-ui/react';
import React from 'react';

import { ColorModeProvider } from '@/components/ui/color-mode';
import { recipes, slotRecipes } from '@/components/utils/chakra/recipes';

import type { ColorModeProviderProps } from '@/components/ui/color-mode';

const FONT = `Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen-Sans, Ubuntu, Cantarell, Helvetica Neue, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`;

const config = defineConfig({
  globalCss: {
    '*': {
      scrollBehavior: 'smooth',
      _scrollbar: {
        width: '8px',
        height: '6px',
      },
      _scrollbarThumb: {
        borderRadius: 'xs',
        backgroundColor: 'fg.subtle',
      },
      _scrollbarTrack: {
        backgroundColor: 'transparent',
      },
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: { value: FONT },
        body: { value: FONT },
      },
      colors: {
        gray: {
          100: { value: 'hsl(246, 18%, 15%)' },
          200: { value: 'hsl(246, 11%, 22%)' },
          300: { value: 'hsl(246,  8%, 35%)' },
          500: { value: 'hsl(246, 6%, 55%)' },
          600: { value: 'hsl(246, 6%, 65%)' },
          700: { value: 'hsl(246, 6%, 78%)' },
        },
        blue: {
          50: { value: 'hsl(219, 67.00%, 21.40%)' },
          100: { value: 'hsl(220, 55%, 13%)' },
          200: { value: 'hsl(220, 62%, 25%)' },
          300: { value: 'hsl(220, 68%, 35%)' },
          400: { value: 'hsl(220, 72%, 45%)' },
          500: { value: 'hsl(220, 80%, 55%)' },
          600: { value: 'hsl(220, 80%, 65%)' },
          700: { value: 'hsl(220, 80%, 75%)' },
          800: { value: 'hsl(220, 80%, 85%)' },
          900: { value: 'hsl(220, 80%, 95%)' },
          950: { value: 'hsl(220, 55%, 97%)' },
        },
        pink: {
          50: { value: 'hsl(270, 38%, 12%)' },
          100: { value: 'hsl(270, 40%, 16%)' },
          200: { value: 'hsl(270, 45%, 24%)' },
          300: { value: 'hsl(270, 50%, 32%)' },
          400: { value: 'hsl(270, 55%, 43%)' },
          500: { value: 'hsl(270, 60%, 52%)' },
          600: { value: 'hsl(270, 70%, 65%)' },
          700: { value: 'hsl(270, 70%, 75%)' },
          800: { value: 'hsl(270, 70%, 85%)' },
          900: { value: 'hsl(270, 70%, 95%)' },
          950: { value: 'hsl(270, 70%, 98%)' },
        },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: {
            value: 'hsl(250, 24%, 9%)',
          },
          subtle: {
            value: 'hsl(250, 21%, 11%)',
          },
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
