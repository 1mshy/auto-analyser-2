import React from 'react';
import {
  Box,
  Button,
  HStack,
  VStack,
  Input,
  Badge,
  NativeSelect,
} from '@chakra-ui/react';
import { Trash2, Plus } from 'lucide-react';
import {
  Condition,
  ConditionGroup,
  ConditionType,
  CONDITION_LABELS,
  defaultCondition,
} from '../../types';

interface Props {
  value: ConditionGroup;
  onChange: (next: ConditionGroup) => void;
  /** Whether this is the root (root can't be deleted). */
  isRoot?: boolean;
  onDelete?: () => void;
  depth?: number;
}

/**
 * Recursive AND/OR/NOT tree editor. Indents children by depth so the visual
 * nesting matches the logical grouping.
 */
export const ConditionBuilder: React.FC<Props> = ({
  value,
  onChange,
  isRoot = false,
  onDelete,
  depth = 0,
}) => {
  const borderColor =
    value.op === 'and' ? 'accent.emphasis' : value.op === 'or' ? 'signal.info.solid' : value.op === 'not' ? 'signal.warn.solid' : 'border.emphasis';

  if (value.op === 'leaf') {
    return (
      <LeafRow
        condition={value.condition}
        onChange={c => onChange({ op: 'leaf', condition: c })}
        onDelete={onDelete}
      />
    );
  }

  const addLeaf = () => {
    const newLeaf: ConditionGroup = {
      op: 'leaf',
      condition: defaultCondition('rsi_below'),
    };
    if (value.op === 'not') {
      onChange({ op: 'not', child: newLeaf });
    } else {
      onChange({ ...value, children: [...value.children, newLeaf] });
    }
  };

  const addGroup = (op: 'and' | 'or') => {
    const child: ConditionGroup = { op, children: [] };
    if (value.op === 'not') {
      onChange({ op: 'not', child });
    } else {
      onChange({ ...value, children: [...value.children, child] });
    }
  };

  return (
    <Box
      bg="bg.inset"
      borderWidth="1px"
      borderColor="border.subtle"
      borderLeftWidth="3px"
      borderLeftColor={borderColor}
      borderRadius="md"
      p={3}
      ml={depth > 0 ? 4 : 0}
    >
      <HStack justify="space-between" mb={2}>
        <HStack>
          <Badge colorPalette={value.op === 'and' ? 'blue' : value.op === 'or' ? 'purple' : 'orange'} size="sm">
            {value.op.toUpperCase()}
          </Badge>
          <NativeSelect.Root size="xs" w="110px">
            <NativeSelect.Field
              value={value.op}
              bg="bg.surface"
              color="fg.default"
              borderColor="border.subtle"
              onChange={e => {
                const next = e.target.value as 'and' | 'or' | 'not';
                if (next === 'not') {
                  const firstChild =
                    value.op === 'not'
                      ? value.child
                      : value.children[0] || { op: 'leaf', condition: defaultCondition('rsi_below') };
                  onChange({ op: 'not', child: firstChild });
                } else {
                  const kids =
                    value.op === 'not'
                      ? [value.child]
                      : value.children;
                  onChange({ op: next, children: kids });
                }
              }}
            >
              <option value="and">AND</option>
              <option value="or">OR</option>
              <option value="not">NOT</option>
            </NativeSelect.Field>
          </NativeSelect.Root>
        </HStack>
        {!isRoot && onDelete && (
          <Button size="xs" variant="ghost" colorPalette="red" onClick={onDelete}>
            <Trash2 size={12} />
          </Button>
        )}
      </HStack>

      <VStack align="stretch" gap={2}>
        {value.op === 'not' ? (
          <ConditionBuilder
            value={value.child}
            onChange={next => onChange({ op: 'not', child: next })}
            depth={depth + 1}
          />
        ) : (
          value.children.map((child, idx) => (
            <ConditionBuilder
              key={idx}
              value={child}
              onChange={next => {
                const copy = [...value.children];
                copy[idx] = next;
                onChange({ ...value, children: copy });
              }}
              onDelete={() => {
                const copy = value.children.filter((_, i) => i !== idx);
                onChange({ ...value, children: copy });
              }}
              depth={depth + 1}
            />
          ))
        )}
      </VStack>

      {value.op !== 'not' && (
        <HStack mt={2} gap={2}>
          <Button size="xs" variant="outline" colorPalette="gray" onClick={addLeaf}>
            <Plus size={12} /> Condition
          </Button>
          <Button size="xs" variant="outline" colorPalette="blue" onClick={() => addGroup('and')}>
            <Plus size={12} /> AND group
          </Button>
          <Button size="xs" variant="outline" colorPalette="purple" onClick={() => addGroup('or')}>
            <Plus size={12} /> OR group
          </Button>
        </HStack>
      )}
    </Box>
  );
};

// ------------------ leaf row ------------------

const LeafRow: React.FC<{
  condition: Condition;
  onChange: (c: Condition) => void;
  onDelete?: () => void;
}> = ({ condition, onChange, onDelete }) => {
  const type = condition.type;

  // Render the value input appropriate for the condition type.
  const renderValueInput = () => {
    switch (type) {
      case 'rsi_below':
      case 'rsi_above':
      case 'price_below':
      case 'price_above':
      case 'price_change_pct_below':
      case 'price_change_pct_above':
      case 'stochastic_k_below':
      case 'stochastic_k_above':
      case 'bollinger_bandwidth_below':
      case 'volume_above':
      case 'drop_from_high_pct':
        return (
          <Input
            size="sm"
            type="number"
            w="120px"
            bg="bg.surface"
            borderColor="border.subtle"
            color="fg.default"
            value={(condition as any).value}
            onChange={e =>
              onChange({ ...(condition as any), value: parseFloat(e.target.value) || 0 })
            }
          />
        );
      case 'near_52_week_low':
      case 'near_52_week_high':
        return (
          <Input
            size="sm"
            type="number"
            w="120px"
            bg="bg.surface"
            borderColor="border.subtle"
            color="fg.default"
            placeholder="%"
            value={(condition as any).within_pct}
            onChange={e =>
              onChange({ ...(condition as any), within_pct: parseFloat(e.target.value) || 0 })
            }
          />
        );
      case 'sector_equals':
        return (
          <Input
            size="sm"
            w="180px"
            bg="bg.surface"
            borderColor="border.subtle"
            color="fg.default"
            value={(condition as any).sector}
            onChange={e => onChange({ ...(condition as any), sector: e.target.value })}
          />
        );
      default:
        return null;
    }
  };

  return (
    <HStack bg="bg.muted" p={2} borderRadius="md" borderWidth="1px" borderColor="border.subtle">
      <NativeSelect.Root size="sm" w="260px">
        <NativeSelect.Field
          value={type}
          bg="bg.surface"
          color="fg.default"
          borderColor="border.subtle"
          onChange={e => onChange(defaultCondition(e.target.value as ConditionType))}
        >
          {(Object.keys(CONDITION_LABELS) as ConditionType[]).map(t => (
            <option key={t} value={t}>
              {CONDITION_LABELS[t]}
            </option>
          ))}
        </NativeSelect.Field>
      </NativeSelect.Root>
      {renderValueInput()}
      <Box flex={1} />
      {onDelete && (
        <Button size="xs" variant="ghost" colorPalette="red" onClick={onDelete}>
          <Trash2 size={12} />
        </Button>
      )}
    </HStack>
  );
};

// A short human-readable preview of a ConditionGroup tree — useful for rule lists.
export function describeGroup(g: ConditionGroup): string {
  if (g.op === 'leaf') return describeCondition(g.condition);
  if (g.op === 'not') return `NOT (${describeGroup(g.child)})`;
  if (g.children.length === 0) return '(empty)';
  const parts = g.children.map(describeGroup);
  return parts.join(g.op === 'and' ? ' AND ' : ' OR ');
}

function describeCondition(c: Condition): string {
  switch (c.type) {
    case 'rsi_below': return `RSI<${c.value}`;
    case 'rsi_above': return `RSI>${c.value}`;
    case 'price_below': return `Price<$${c.value}`;
    case 'price_above': return `Price>$${c.value}`;
    case 'price_change_pct_below': return `Δ<${c.value}%`;
    case 'price_change_pct_above': return `Δ>${c.value}%`;
    case 'near_52_week_low': return `Near 52w-low ≤${c.within_pct}%`;
    case 'near_52_week_high': return `Near 52w-high ≤${c.within_pct}%`;
    case 'macd_bullish_cross': return 'MACD bull cross';
    case 'macd_bearish_cross': return 'MACD bear cross';
    case 'stochastic_k_below': return `%K<${c.value}`;
    case 'stochastic_k_above': return `%K>${c.value}`;
    case 'bollinger_bandwidth_below': return `BBW<${c.value}`;
    case 'is_oversold': return 'Oversold';
    case 'is_overbought': return 'Overbought';
    case 'volume_above': return `Vol>${c.value}`;
    case 'sector_equals': return `Sector=${c.sector}`;
    case 'drop_from_high_pct': return `Down≥${c.value}% from 52w-high`;
  }
}
