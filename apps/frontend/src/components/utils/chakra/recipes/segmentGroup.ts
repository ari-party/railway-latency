import { defineSlotRecipe } from '@chakra-ui/react';
import { segmentGroupAnatomy } from '@chakra-ui/react/anatomy';

export const segmentGroupRecipe = defineSlotRecipe({
  slots: segmentGroupAnatomy.keys(),
  base: {
    root: {
      display: 'inline-flex',
      width: 'max-content',
      padding: '3px',
      gap: '1px',
      background: 'bg.subtle',
      borderWidth: '1px',
      borderColor: 'border.muted',
      borderRadius: 'lg',
      boxShadow: 'none',
      '--segment-radius': 'radii.md',
    },
    item: {
      position: 'relative',
      zIndex: 1,
      color: 'fg.muted',
      fontWeight: 'medium',
      cursor: 'pointer',
      borderRadius: 'md',
      transition: 'color 0.15s ease',
      _hover: {
        color: 'fg',
      },
      '&[data-state=checked]': {
        color: 'fg',
      },
      '&[data-disabled]': {
        cursor: 'not-allowed',
        opacity: 0.45,
      },
    },
    indicator: {
      background: 'bg.emphasized',
      borderRadius: 'md',
      borderWidth: '1px',
      borderColor: 'border.DEFAULT',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
    },
    itemText: {
      fontSize: 'sm',
      lineHeight: '20px',
    },
  },
});
