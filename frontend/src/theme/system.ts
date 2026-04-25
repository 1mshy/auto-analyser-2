import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import {
  chakraGlobalCss,
  chakraSemanticTokens,
  chakraTokens,
} from "./design-tokens";

const customConfig = defineConfig({
  globalCss: chakraGlobalCss,
  theme: {
    tokens: chakraTokens,
    semanticTokens: chakraSemanticTokens,
  },
});

export const system = createSystem(defaultConfig, customConfig);
