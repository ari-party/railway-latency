import { defineSlotRecipe } from '@chakra-ui/react';
import { selectAnatomy } from '@chakra-ui/react/anatomy';

export const selectRecipe = defineSlotRecipe({
  slots: selectAnatomy.keys(),
  base: {
    root: {
      borderWidth: '1px',
    },
    trigger: {
      border: 'none',
      borderRadius: 'none',
      minHeight: 'unset',
      paddingInline: 'unset',
    },
    content: {
      borderRadius: 'none',
    },
    item: {
      borderRadius: 'none',
    },
  },
  variants: {
    size: {
      sm: {
        control: {
          padding: 2,
        },
        indicatorGroup: {
          paddingInline: 2,
        },
      },
    },
  },
});
