'use client';

import '@fontsource-variable/hanken-grotesk';
import '@fontsource-variable/jetbrains-mono';

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

const SANS = `'Hanken Grotesk Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const MONO = `'JetBrains Mono Variable', ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace`;

const SURFACE_BASE = 'hsl(252, 16%, 5%)';
const SURFACE_SUBTLE = 'hsl(252, 14%, 7.5%)';
const SURFACE_PANEL = 'hsl(252, 13%, 9%)';
const SURFACE_ELEVATED = 'hsl(252, 12%, 12%)';

const POPUP_BG = SURFACE_ELEVATED;

const config = defineConfig({
  globalCss: {
    html: {
      colorScheme: 'dark',
    },
    body: {
      background: 'bg',
      color: 'fg',
      fontFeatureSettings: '"cv11", "ss01"',
      textRendering: 'optimizeLegibility',
    },
    '::selection': {
      background: 'hsl(266, 85%, 69%, 0.32)',
    },
    '*:focus:not(:focus-visible)': {
      outline: 'none !important',
      boxShadow: 'none !important',
    },
    '*:focus-visible': {
      outline: '2px solid hsl(266, 85%, 69%) !important',
      outlineOffset: '1px',
      boxShadow: 'none !important',
    },
    '.maplibregl-canvas:focus, .maplibregl-canvas:focus-visible': {
      outline: 'none !important',
    },
    '*': {
      scrollBehavior: 'smooth',
      _scrollbar: {
        width: '10px',
        height: '8px',
      },
      _scrollbarThumb: {
        borderRadius: 'full',
        backgroundColor: 'gray.300',
        border: '2px solid transparent',
        backgroundClip: 'content-box',
      },
      _scrollbarTrack: {
        backgroundColor: 'transparent',
      },
      '&::-webkit-scrollbar-thumb:hover': {
        backgroundColor: 'gray.500',
      },
    },
    '.maplibregl-popup-content': {
      background: `${POPUP_BG} !important`,
      color: 'hsl(0, 0%, 92%) !important',
      border: '1px solid hsl(252, 10%, 22%) !important',
      borderRadius: '10px !important',
      boxShadow: '0 8px 28px rgba(0, 0, 0, 0.55) !important',
      padding: '10px 12px !important',
      fontFamily: `${SANS} !important`,
    },
    '.maplibregl-popup-close-button': {
      color: 'hsl(0, 0%, 62%) !important',
      fontSize: '16px',
      paddingRight: '6px',
    },
    '.maplibregl-popup-anchor-top .maplibregl-popup-tip, .maplibregl-popup-anchor-top-left .maplibregl-popup-tip, .maplibregl-popup-anchor-top-right .maplibregl-popup-tip':
      {
        borderBottomColor: `${POPUP_BG} !important`,
      },
    '.maplibregl-popup-anchor-bottom .maplibregl-popup-tip, .maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip, .maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip':
      {
        borderTopColor: `${POPUP_BG} !important`,
      },
    '.maplibregl-popup-anchor-left .maplibregl-popup-tip': {
      borderRightColor: `${POPUP_BG} !important`,
    },
    '.maplibregl-popup-anchor-right .maplibregl-popup-tip': {
      borderLeftColor: `${POPUP_BG} !important`,
    },
  },
  theme: {
    keyframes: {
      probePulse: {
        '0%': { transform: 'translate(-50%, -50%) scale(1)', opacity: '0.5' },
        '70%': { transform: 'translate(-50%, -50%) scale(3)', opacity: '0' },
        '100%': { transform: 'translate(-50%, -50%) scale(3)', opacity: '0' },
      },
    },
    tokens: {
      fonts: {
        heading: { value: SANS },
        body: { value: SANS },
        mono: { value: MONO },
      },
      colors: {
        gray: {
          100: { value: 'hsl(252, 8%, 16%, 0.55)' },
          200: { value: 'hsl(252, 9%, 64%, 0.14)' },
          300: { value: 'hsl(252, 9%, 70%, 0.22)' },
          400: { value: 'hsl(252, 7%, 46%)' },
          500: { value: 'hsl(252, 7%, 58%)' },
          600: { value: 'hsl(252, 8%, 70%)' },
          700: { value: 'hsl(252, 10%, 82%)' },
          800: { value: 'hsl(252, 14%, 90%)' },
        },
        violet: {
          50: { value: 'hsl(266, 42%, 14%)' },
          100: { value: 'hsl(266, 44%, 18%)' },
          200: { value: 'hsl(266, 46%, 26%)' },
          300: { value: 'hsl(266, 54%, 40%)' },
          400: { value: 'hsl(266, 72%, 58%)' },
          500: { value: 'hsl(266, 85%, 69%)' },
          600: { value: 'hsl(266, 90%, 77%)' },
          700: { value: 'hsl(266, 92%, 85%)' },
        },
        blue: {
          300: { value: 'hsl(212, 90%, 72%)' },
          400: { value: 'hsl(212, 88%, 64%)' },
          500: { value: 'hsl(212, 85%, 58%)' },
          600: { value: 'hsl(212, 84%, 54%)' },
        },
        teal: {
          300: { value: 'hsl(168, 70%, 58%)' },
          400: { value: 'hsl(168, 72%, 48%)' },
          500: { value: 'hsl(168, 74%, 42%)' },
          600: { value: 'hsl(168, 74%, 40%)' },
        },
        pink: {
          300: { value: 'hsl(330, 82%, 72%)' },
          400: { value: 'hsl(330, 80%, 64%)' },
          500: { value: 'hsl(330, 78%, 58%)' },
          600: { value: 'hsl(330, 78%, 56%)' },
        },
        red: {
          300: { value: 'hsl(2, 84%, 70%)' },
          400: { value: 'hsl(2, 82%, 63%)' },
          500: { value: 'hsl(2, 80%, 58%)' },
        },
        green: {
          400: { value: 'hsl(146, 64%, 50%)' },
          500: { value: 'hsl(146, 66%, 44%)' },
        },
        amber: {
          400: { value: 'hsl(38, 92%, 56%)' },
          500: { value: 'hsl(38, 92%, 50%)' },
        },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: { value: SURFACE_BASE },
          subtle: { value: SURFACE_SUBTLE },
          muted: { value: SURFACE_PANEL },
          panel: { value: SURFACE_PANEL },
          emphasized: { value: SURFACE_ELEVATED },
        },
        fg: {
          DEFAULT: { value: 'hsl(252, 14%, 93%)' },
          muted: { value: 'hsl(252, 7%, 60%)' },
          subtle: { value: 'hsl(252, 7%, 44%)' },
          solid: { value: 'hsl(0, 0%, 100%)' },
        },
        border: {
          DEFAULT: { value: 'hsl(252, 9%, 64%, 0.14)' },
          muted: { value: 'hsl(252, 9%, 64%, 0.09)' },
          emphasized: { value: 'hsl(252, 9%, 70%, 0.24)' },
        },
        accent: {
          DEFAULT: { value: '{colors.violet.500}' },
          subtle: { value: '{colors.violet.50}' },
          emphasized: { value: '{colors.violet.600}' },
          fg: { value: 'hsl(266, 60%, 8%)' },
        },
        status: {
          green: { value: '{colors.green.400}' },
          stale: { value: '{colors.amber.400}' },
          down: { value: '{colors.red.400}' },
          inactive: { value: '{colors.gray.500}' },
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
