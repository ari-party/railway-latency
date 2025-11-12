import { alertRecipe } from './alert';
import { buttonRecipe } from './button';
import { codeRecipe } from './code';
import { segmentGroupRecipe } from './segmentGroup';
import { selectRecipe } from './select';
import { toastRecipe } from './toast';

export const recipes = {
  button: buttonRecipe,
  code: codeRecipe,
};

export const slotRecipes = {
  alert: alertRecipe,
  segmentGroup: segmentGroupRecipe,
  select: selectRecipe,
  toast: toastRecipe,
};
