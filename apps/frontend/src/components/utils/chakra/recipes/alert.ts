import { defineSlotRecipe } from '@chakra-ui/react';
import { alertAnatomy } from '@chakra-ui/react/anatomy';

export const alertRecipe = defineSlotRecipe({
  slots: alertAnatomy.keys(),
  base: {
    root: {
      borderRadius: 'none',
    },
  },
});
