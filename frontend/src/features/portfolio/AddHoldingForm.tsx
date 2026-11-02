import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Checkbox, HStack, Input, Text, VStack } from '@chakra-ui/react';
import { Plus } from 'lucide-react';
import { toaster } from '../../components/ui/toaster';
import { usePortfolioMutations } from '../../queries';

/** Manual entry for a single lot, for holdings not in any export. */
export function AddHoldingForm() {
  const { add } = usePortfolioMutations();
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [currency, setCurrency] = useState('');
  const [account, setAccount] = useState('');
  const [isCdr, setIsCdr] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const qty = Number(quantity);
    if (!symbol.trim()) {
      toaster.create({ title: 'Symbol required', type: 'error' });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toaster.create({ title: 'Quantity must be a positive number', type: 'error' });
      return;
    }
    const cost = avgCost.trim() ? Number(avgCost) : null;
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
      toaster.create({ title: 'Average cost must be ≥ 0', type: 'error' });
      return;
    }
    try {
      const holding = await add.mutateAsync({
        symbol: symbol.trim(),
        quantity: qty,
        avg_cost: cost,
        currency: currency.trim() || null,
        account: account.trim() || null,
        is_cdr: isCdr,
      });
      toaster.create({ title: `Added ${holding.symbol}`, type: 'success' });
      setSymbol('');
      setQuantity('');
      setAvgCost('');
      setAccount('');
      setIsCdr(false);
    } catch (error) {
      toaster.create({
        title: 'Could not add holding',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    }
  };

  return (
    <form onSubmit={submit}>
      <VStack align="stretch" gap={3}>
        <HStack gap={2} wrap="wrap">
          <Input
            aria-label="Symbol"
            placeholder="Symbol (AAPL, SHOP.TO)"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            size="sm"
            flex="1 1 140px"
          />
          <Input
            aria-label="Quantity"
            placeholder="Quantity"
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            size="sm"
            flex="1 1 100px"
          />
        </HStack>
        <HStack gap={2} wrap="wrap">
          <Input
            aria-label="Average cost per unit"
            placeholder="Avg cost / unit"
            type="number"
            min={0}
            step="any"
            value={avgCost}
            onChange={(event) => setAvgCost(event.target.value)}
            size="sm"
            flex="1 1 120px"
          />
          <Input
            aria-label="Currency"
            placeholder="Currency (USD)"
            maxLength={3}
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            size="sm"
            flex="1 1 90px"
          />
          <Input
            aria-label="Account"
            placeholder="Account (optional)"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            size="sm"
            flex="1 1 140px"
          />
        </HStack>
        <HStack justify="space-between" gap={3} wrap="wrap">
          <Checkbox.Root
            size="sm"
            checked={isCdr}
            onCheckedChange={(details) => setIsCdr(Boolean(details.checked))}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>
              <Text fontSize="xs" color="fg.muted">
                Canadian Depositary Receipt (CDR)
              </Text>
            </Checkbox.Label>
          </Checkbox.Root>
          <Button type="submit" size="sm" variant="outline" loading={add.isPending}>
            <Plus size={14} /> Add holding
          </Button>
        </HStack>
      </VStack>
    </form>
  );
}
