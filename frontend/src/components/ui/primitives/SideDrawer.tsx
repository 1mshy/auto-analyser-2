import React from "react";
import { Drawer } from "@chakra-ui/react";

export type SideDrawerPlacement = "start" | "end" | "bottom";
export type SideDrawerSize = "xs" | "sm" | "md" | "lg" | "full";

export interface SideDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  placement?: SideDrawerPlacement;
  size?: SideDrawerSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Canonical drawer shell: backdrop, positioner, bordered content, header with
 * close trigger, and optional footer. `placement="bottom"` behaves as a mobile
 * bottom sheet and respects the device safe-area inset.
 */
export const SideDrawer: React.FC<SideDrawerProps> = ({
  open,
  onOpenChange,
  title,
  placement = "end",
  size = "md",
  children,
  footer,
}) => {
  const isBottom = placement === "bottom";
  const edgeProps =
    placement === "start"
      ? { borderRightWidth: "1px" }
      : placement === "end"
      ? { borderLeftWidth: "1px" }
      : { borderTopWidth: "1px", borderTopRadius: "lg" };

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(details: { open: boolean }) => onOpenChange(details.open)}
      placement={placement}
      size={size}
    >
      <Drawer.Backdrop />
      <Drawer.Positioner>
        <Drawer.Content bg="bg.surface" borderColor="border.default" {...edgeProps}>
          <Drawer.Header borderBottomWidth="1px" borderColor="border.subtle">
            {title != null && <Drawer.Title color="fg.default">{title}</Drawer.Title>}
            <Drawer.CloseTrigger aria-label="Close drawer" />
          </Drawer.Header>

          <Drawer.Body
            pb={
              isBottom && !footer
                ? "calc(1rem + env(safe-area-inset-bottom))"
                : undefined
            }
          >
            {children}
          </Drawer.Body>

          {footer && (
            <Drawer.Footer
              borderTopWidth="1px"
              borderColor="border.subtle"
              pb={isBottom ? "calc(0.75rem + env(safe-area-inset-bottom))" : undefined}
            >
              {footer}
            </Drawer.Footer>
          )}
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>
  );
};
