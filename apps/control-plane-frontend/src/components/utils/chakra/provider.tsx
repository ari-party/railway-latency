'use client';

import {
  ChakraProvider,
  createSystem,
  defaultConfig,
  defineConfig,
} from '@chakra-ui/react';

import type { ReactNode } from 'react';

const SANS_FONT = `var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif`;
const MONO_FONT = `var(--font-plex-mono), ui-monospace, monospace`;

const config = defineConfig({
  globalCss: {
    html: {
      colorScheme: 'dark',
      colorPalette: 'purple',
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: { value: SANS_FONT },
        body: { value: SANS_FONT },
        mono: { value: MONO_FONT },
      },
      colors: {
        purple: {
          50: { value: '#f8f4fe' },
          100: { value: '#efe6fd' },
          200: { value: '#e0cdfb' },
          300: { value: '#cdaef8' },
          400: { value: '#ba8cf6' },
          500: { value: '#a96df3' },
          600: { value: '#9252e2' },
          700: { value: '#7c3dc6' },
          800: { value: '#6530a1' },
          900: { value: '#50267d' },
          950: { value: '#331254' },
        },
      },
    },
    semanticTokens: {
      colors: {
        purple: {
          contrast: { value: 'white' },
          fg: { value: '{colors.purple.300}' },
          subtle: { value: '{colors.purple.950}' },
          muted: { value: '{colors.purple.900}' },
          emphasized: { value: '{colors.purple.800}' },
          solid: { value: '{colors.purple.500}' },
          focusRing: { value: '{colors.purple.500}' },
        },
        bg: {
          DEFAULT: { value: '#0a0a0b' },
          subtle: { value: '#141417' },
          muted: { value: '#1c1c20' },
          emphasized: { value: '#26262b' },
          panel: { value: '#141417' },
        },
        fg: {
          DEFAULT: { value: '#fafafa' },
          muted: { value: '#a1a1aa' },
          subtle: { value: '#71717a' },
        },
        border: {
          DEFAULT: { value: '#27272a' },
          subtle: { value: '#1f1f23' },
          muted: { value: '#222226' },
          emphasized: { value: '#3f3f46' },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);

export function Provider({ children }: { children: ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
