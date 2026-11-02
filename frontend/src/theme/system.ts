import {
  createSystem,
  defaultConfig,
  defineConfig,
  type ThemingConfig,
} from '@chakra-ui/react';
import {
  chakraBreakpoints,
  chakraGlobalCss,
  chakraSemanticTokens,
  chakraTokens,
} from './design-tokens';

type SemanticTree = NonNullable<
  NonNullable<ThemingConfig['semanticTokens']>['colors']
>;

// Chakra merges nested token paths with its defaults. Keeping dotted names as
// literal keys creates duplicate variables and lets built-in greys win.
function nestTokens(
  tokens: Record<
    string,
    { readonly value: string | Readonly<Record<string, string>> }
  >,
): SemanticTree {
  const tree: SemanticTree = {};
  for (const [name, token] of Object.entries(tokens)) {
    const path = name.split('.');
    let branch = tree;
    path.forEach((part, index) => {
      if (index === path.length - 1) branch[part] = token;
      else {
        branch[part] ??= {};
        branch = branch[part] as SemanticTree;
      }
    });
  }
  return tree;
}

const customConfig = defineConfig({
  globalCss: chakraGlobalCss,
  theme: {
    breakpoints: chakraBreakpoints,
    tokens: chakraTokens,
    semanticTokens: {
      colors: nestTokens(chakraSemanticTokens.colors),
      shadows: nestTokens(chakraSemanticTokens.shadows),
    },
  },
});

export const system = createSystem(defaultConfig, customConfig);
