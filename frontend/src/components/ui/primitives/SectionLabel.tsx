import React from "react";
import { Text, type TextProps } from "@chakra-ui/react";

export interface SectionLabelProps extends TextProps {
  children: React.ReactNode;
}

/**
 * Uppercase eyebrow label for section headings within panels and pages.
 */
export const SectionLabel = React.forwardRef<HTMLParagraphElement, SectionLabelProps>(
  function SectionLabel({ children, ...rest }, ref) {
    return (
      <Text
        ref={ref}
        fontSize="xs"
        fontWeight={600}
        letterSpacing="wider"
        textTransform="uppercase"
        color="fg.subtle"
        {...rest}
      >
        {children}
      </Text>
    );
  }
);
