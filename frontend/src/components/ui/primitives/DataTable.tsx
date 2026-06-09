import React, { useMemo, useState } from "react";
import { Box, Stack, Table, chakra } from "@chakra-ui/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useIsMobile } from "../../../theme/responsive";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: "left" | "right" | "center";
  numeric?: boolean;
  sortable?: boolean;
  sortValue?: (row: T) => number | string | null | undefined;
  cell: (row: T) => React.ReactNode;
  width?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  defaultSort?: { key: string; desc?: boolean };
  onRowClick?: (row: T) => void;
  maxH?: string;
  size?: "sm" | "md";
  renderCard?: (row: T) => React.ReactNode;
  cardBreakpoint?: boolean;
}

interface SortState {
  key: string;
  desc: boolean;
}

function columnAlign<T>(col: DataTableColumn<T>): "left" | "right" | "center" {
  return col.align ?? (col.numeric ? "right" : "left");
}

interface DataTableRowProps<T> {
  row: T;
  columns: DataTableColumn<T>[];
  onRowClick?: (row: T) => void;
}

function DataTableRowBase<T>({ row, columns, onRowClick }: DataTableRowProps<T>) {
  const clickable = Boolean(onRowClick);

  return (
    <Table.Row
      tabIndex={clickable ? 0 : undefined}
      cursor={clickable ? "pointer" : undefined}
      onClick={clickable ? () => onRowClick!(row) : undefined}
      onKeyDown={
        clickable
          ? (e: React.KeyboardEvent<HTMLTableRowElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick!(row);
              }
            }
          : undefined
      }
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "accent.solid",
        outlineOffset: "-2px",
      }}
      css={{
        "@media (hover: hover)": {
          "&:hover": { bg: "bg.muted" },
        },
      }}
    >
      {columns.map((col) => (
        <Table.Cell
          key={col.key}
          textAlign={columnAlign(col)}
          className={col.numeric ? "num" : undefined}
        >
          {col.cell(row)}
        </Table.Cell>
      ))}
    </Table.Row>
  );
}

const DataTableRow = React.memo(DataTableRowBase) as typeof DataTableRowBase;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  defaultSort,
  onRowClick,
  maxH,
  size = "sm",
  renderCard,
  cardBreakpoint,
}: DataTableProps<T>): React.ReactElement {
  const [sort, setSort] = useState<SortState | null>(
    defaultSort ? { key: defaultSort.key, desc: Boolean(defaultSort.desc) } : null
  );
  const isMobile = useIsMobile();

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const getValue = col?.sortValue;
    if (!getValue) return rows;
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, columns, sort]);

  const showCards = Boolean(renderCard) && (cardBreakpoint ?? isMobile);

  if (showCards && renderCard) {
    return (
      <Stack gap={3}>
        {sorted.map((row) => (
          <Box
            key={rowKey(row)}
            cursor={onRowClick ? "pointer" : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {renderCard(row)}
          </Box>
        ))}
      </Stack>
    );
  }

  const toggleSort = (col: DataTableColumn<T>) => {
    setSort((prev) =>
      prev && prev.key === col.key
        ? { key: col.key, desc: !prev.desc }
        : { key: col.key, desc: false }
    );
  };

  return (
    <Box overflowX="auto" overflowY="auto" maxH={maxH}>
      <Table.Root size={size}>
        <Table.Header bg="bg.inset" position="sticky" top={0} zIndex={1}>
          <Table.Row>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              return (
                <Table.ColumnHeader
                  key={col.key}
                  color="fg.muted"
                  fontSize="xs"
                  textTransform="uppercase"
                  textAlign={columnAlign(col)}
                  width={col.width}
                  className={col.numeric ? "num" : undefined}
                  aria-sort={
                    col.sortable
                      ? active
                        ? sort!.desc
                          ? "descending"
                          : "ascending"
                        : "none"
                      : undefined
                  }
                >
                  {col.sortable ? (
                    <chakra.button
                      type="button"
                      onClick={() => toggleSort(col)}
                      display="inline-flex"
                      alignItems="center"
                      gap="1"
                      cursor="pointer"
                      userSelect="none"
                      bg="transparent"
                      color="inherit"
                      fontFamily="inherit"
                      fontSize="inherit"
                      fontWeight="inherit"
                      letterSpacing="inherit"
                      textTransform="inherit"
                      _focusVisible={{
                        outline: "2px solid",
                        outlineColor: "accent.solid",
                        outlineOffset: "2px",
                        borderRadius: "sm",
                      }}
                    >
                      {col.header}
                      {active &&
                        (sort!.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                    </chakra.button>
                  ) : (
                    col.header
                  )}
                </Table.ColumnHeader>
              );
            })}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sorted.map((row) => (
            <DataTableRow
              key={rowKey(row)}
              row={row}
              columns={columns}
              onRowClick={onRowClick}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
