import { Box, Field, HStack, Input, Text } from '@chakra-ui/react';
import type { StockFilter } from '../../types';
import type { NumericFilter } from './workspace';

export function NumericFilterField({
  label,
  field,
  filter,
  onChange,
  multiplier = 1,
  max,
  shortLabel,
}: {
  label: string;
  field: NumericFilter;
  filter: StockFilter;
  onChange: (filter: StockFilter) => void;
  multiplier?: number;
  max?: number;
  shortLabel?: string;
}) {
  return (
    <Field.Root>
      <Field.Label color="fg.muted" fontSize="xs">
        {shortLabel ?? label}
      </Field.Label>
      <Input
        aria-label={label}
        type="number"
        min={0}
        max={max}
        step="any"
        size="sm"
        bg="bg.inset"
        value={filter[field] == null ? '' : filter[field]! / multiplier}
        placeholder="Any"
        onChange={(event) =>
          onChange({
            ...filter,
            [field]:
              event.target.value === ''
                ? undefined
                : Number(event.target.value) * multiplier,
          })
        }
      />
    </Field.Root>
  );
}

export function FilterRange({
  title,
  min,
  max,
  filter,
  onChange,
  multiplier,
  limit,
}: {
  title: string;
  min: NumericFilter;
  max: NumericFilter;
  filter: StockFilter;
  onChange: (filter: StockFilter) => void;
  multiplier?: number;
  limit?: number;
}) {
  return (
    <Box>
      <Text fontSize="sm" fontWeight="semibold" mb={2}>
        {title}
      </Text>
      <HStack gap={3} align="start">
        <NumericFilterField
          label={`Minimum ${title.toLowerCase()}`}
          shortLabel="Minimum"
          field={min}
          filter={filter}
          onChange={onChange}
          multiplier={multiplier}
          max={limit}
        />
        <NumericFilterField
          label={`Maximum ${title.toLowerCase()}`}
          shortLabel="Maximum"
          field={max}
          filter={filter}
          onChange={onChange}
          multiplier={multiplier}
          max={limit}
        />
      </HStack>
    </Box>
  );
}
