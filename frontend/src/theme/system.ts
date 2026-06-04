import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import {
  chakraBreakpoints,
  chakraGlobalCss,
  chakraSemanticTokens,
  chakraTokens,
} from "./design-tokens";

const customConfig = defineConfig({
  globalCss: chakraGlobalCss,
  theme: {
    breakpoints: chakraBreakpoints,
    tokens: chakraTokens,
    semanticTokens: chakraSemanticTokens,
  },
});

export const system = createSystem(defaultConfig, customConfig);
