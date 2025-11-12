import { defineSlotRecipe } from '@chakra-ui/react';
import { segmentGroupAnatomy } from '@chakra-ui/react/anatomy';

export const segmentGroupRecipe = defineSlotRecipe({
  slots: segmentGroupAnatomy.keys(),
  base: {
    root: {
      '--segment-radius': 'none',
      borderRadius: 'var(--segment-radius)',
    },
  },
});
