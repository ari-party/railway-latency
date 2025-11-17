import { defineSlotRecipe } from '@chakra-ui/react';
import { segmentGroupAnatomy } from '@chakra-ui/react/anatomy';

export const segmentGroupRecipe = defineSlotRecipe({
  slots: segmentGroupAnatomy.keys(),
  base: {
    root: {
      width: 'max-content',
      background: 'unset',
      boxShadow: 'none',
      '--segment-radius': 'radii.sm',
      padding: 0,
    },
    item: {
      color: 'gray.600',
      cursor: 'pointer',
      borderWidth: '1px',
      borderColor: 'gray.200',
      borderLeftWidth: '1px',
      borderRightWidth: '0px',
      height: 'unset',
      _checked: {
        color: 'pink.500',
        borderColor: 'gray.300',
        borderLeftWidth: '1px',
        borderRightWidth: '1px',
      },
      _before: {
        height: '0px',
      },
      '&[data-state=checked] + &:not([data-state=checked])': {
        borderLeftWidth: '0px',
      },
      '&:not(:first-of-type)': {
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
      },
      '&:last-of-type': {
        borderRightWidth: '1px',
      },
      '&:not(:last-child)': {
        borderBottomRightRadius: 0,
        borderTopRightRadius: 0,
      },
    },
    indicator: {
      background: 'transparent',
      shadow: 'none',
    },
    itemText: {
      lineHeight: '20px',
    },
  },
});
