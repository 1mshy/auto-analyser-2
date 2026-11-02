import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  NativeSelect,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { FileUp, Sparkles, Table2, Upload } from 'lucide-react';
import { Callout, DataTable, SignalBadge } from '../../components/ui/primitives';
import type { DataTableColumn } from '../../components/ui/primitives';
import { toaster } from '../../components/ui/toaster';
import { PortfolioImportError } from '../../api';
import { useAIStatus, usePortfolioImport } from '../../queries';
import type {
  ParsedHolding,
  PortfolioImportMode,
  PortfolioImportResult,
  PortfolioParserPreference,
} from '../../types';
import { ACCEPTED_EXTENSIONS, fmtCurrency, parserLabel } from './model';

const previewColumns: DataTableColumn<ParsedHolding>[] = [
  {
    key: 'symbol',
    header: 'Symbol',
    cell: (row) => (
      <HStack gap={2}>
        <Text fontWeight="semibold">{row.symbol}</Text>
        {row.is_cdr && (
          <SignalBadge tone="info" fontSize="2xs">
            CDR
          </SignalBadge>
        )}
      </HStack>
    ),
  },
  {
    key: 'description',
    header: 'Description',
    cell: (row) => (
      <Text fontSize="sm" color="fg.muted" truncate maxW="220px">
        {row.description ?? '—'}
      </Text>
    ),
  },
  { key: 'account', header: 'Account', cell: (row) => row.account ?? '—' },
  { key: 'currency', header: 'Ccy', cell: (row) => row.currency ?? '—' },
  {
    key: 'quantity',
    header: 'Quantity',
    numeric: true,
    cell: (row) => row.quantity.toLocaleString(),
  },
  {
    key: 'avg_cost',
    header: 'Avg cost',
    numeric: true,
    cell: (row) => fmtCurrency(row.avg_cost, row.currency),
  },
  {
    key: 'market_value',
    header: 'Value (file)',
    numeric: true,
    cell: (row) => fmtCurrency(row.market_value, row.currency),
  },
];

function Diagnostics({
  warnings,
  skipped,
}: {
  warnings: string[];
  skipped: string[];
}) {
  const [showSkipped, setShowSkipped] = useState(false);
  if (!warnings.length && !skipped.length) return null;
  return (
    <VStack align="stretch" gap={2}>
      {warnings.map((warning, index) => (
        <Callout key={index} tone="warn" fontSize="sm">
          {warning}
        </Callout>
      ))}
      {skipped.length > 0 && (
        <Box>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setShowSkipped((value) => !value)}
          >
            {showSkipped ? 'Hide' : 'Show'} {skipped.length} skipped row
            {skipped.length === 1 ? '' : 's'}
          </Button>
          {showSkipped && (
            <VStack align="stretch" gap={1} mt={2} pl={2}>
              {skipped.map((line, index) => (
                <Text key={index} fontSize="xs" color="fg.muted">
                  {line}
                </Text>
              ))}
            </VStack>
          )}
        </Box>
      )}
    </VStack>
  );
}

/**
 * Upload or paste a holdings document, preview what the parser read, then
 * commit it. The server tries the configured AI model first and falls back to
 * the deterministic parser; the preview says which one answered.
 */
export function PortfolioImport({
  hasHoldings,
  onImported,
}: {
  hasHoldings: boolean;
  onImported: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [pasting, setPasting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<PortfolioImportMode>('replace');
  const [parser, setParser] = useState<PortfolioParserPreference>('auto');
  const [preview, setPreview] = useState<PortfolioImportResult | null>(null);
  const [failure, setFailure] = useState<PortfolioImportError | null>(null);
  const importMutation = usePortfolioImport();
  const aiStatus = useAIStatus();
  const aiEnabled = Boolean(aiStatus.data?.enabled);

  const source = file
    ? { file }
    : text.trim()
      ? { text, filename: 'pasted.txt' }
      : null;

  const pickFile = (picked: File | null | undefined) => {
    if (!picked) return;
    setFile(picked);
    setText('');
    setPasting(false);
    setPreview(null);
    setFailure(null);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files?.[0]);
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    pickFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const run = async (dryRun: boolean) => {
    if (!source) return;
    setFailure(null);
    try {
      const result = await importMutation.mutateAsync({
        source,
        options: { mode, parser, dry_run: dryRun },
      });
      if (dryRun) {
        setPreview(result);
        return;
      }
      toaster.create({
        title: `Imported ${result.imported} holding${result.imported === 1 ? '' : 's'}`,
        description: `${parserLabel(result.parser, result.model_used)} · ${result.mode === 'replace' ? 'previous holdings replaced' : 'merged into existing holdings'}`,
        type: 'success',
      });
      setPreview(null);
      setFile(null);
      setText('');
      onImported();
    } catch (error) {
      if (error instanceof PortfolioImportError) {
        setFailure(error);
      } else {
        setFailure(
          new PortfolioImportError(
            error instanceof Error ? error.message : 'Import failed.',
          ),
        );
      }
      setPreview(null);
    }
  };

  const busy = importMutation.isPending;

  return (
    <VStack align="stretch" gap={4}>
      <Box
        role="button"
        tabIndex={0}
        aria-label="Choose a holdings file"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        borderWidth="1px"
        borderStyle="dashed"
        borderColor={dragging ? 'accent.solid' : 'border.emphasis'}
        bg={dragging ? 'accent.subtle' : 'bg.subtle'}
        borderRadius="lg"
        p={{ base: 5, md: 7 }}
        textAlign="center"
        cursor="pointer"
        transition="background 120ms"
        _hover={{ bg: 'bg.muted' }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          hidden
          onChange={onInput}
        />
        <VStack gap={2}>
          <Box color="fg.subtle">
            <FileUp size={26} />
          </Box>
          {file ? (
            <>
              <Text fontWeight="semibold" fontSize="sm">
                {file.name}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                {(file.size / 1024).toFixed(1)} KB · click to choose another file
              </Text>
            </>
          ) : (
            <>
              <Text fontWeight="semibold" fontSize="sm">
                Drop a brokerage export here, or click to browse
              </Text>
              <Text fontSize="xs" color="fg.muted">
                CSV, TSV, Excel, ODS, JSON, HTML or plain text. Any column
                layout works; PDF is not supported yet.
              </Text>
            </>
          )}
        </VStack>
      </Box>

      <HStack gap={2} wrap="wrap">
        <Button
          size="xs"
          variant={pasting ? 'subtle' : 'ghost'}
          onClick={() => {
            setPasting((value) => !value);
            if (!pasting) setFile(null);
          }}
        >
          <Table2 size={13} /> {pasting ? 'Hide paste box' : 'Paste text instead'}
        </Button>
      </HStack>
      {pasting && (
        <Textarea
          aria-label="Pasted holdings"
          placeholder={'Symbol, quantity, average cost…\nAAPL 10 203.54\nMSFT 5 410'}
          rows={6}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setPreview(null);
            setFailure(null);
          }}
          fontFamily="mono"
          fontSize="sm"
        />
      )}

      <Flex gap={3} wrap="wrap" align="flex-end">
        <Box>
          <Text fontSize="xs" color="fg.subtle" mb={1}>
            Parser
          </Text>
          <NativeSelect.Root size="sm" width="220px">
            <NativeSelect.Field
              aria-label="Parser"
              value={parser}
              onChange={(event) =>
                setParser(event.target.value as PortfolioParserPreference)
              }
            >
              <option value="auto">
                {aiEnabled ? 'AI first, built-in fallback' : 'Built-in (AI not enabled)'}
              </option>
              <option value="llm" disabled={!aiEnabled}>
                AI model
              </option>
              <option value="heuristic">Built-in parser only</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Box>
        <Box>
          <Text fontSize="xs" color="fg.subtle" mb={1}>
            Existing holdings
          </Text>
          <NativeSelect.Root size="sm" width="200px">
            <NativeSelect.Field
              aria-label="Import mode"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as PortfolioImportMode)
              }
            >
              <option value="replace">Replace everything</option>
              <option value="merge">Merge by symbol + account</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Box>
        <HStack gap={2} ml="auto">
          <Button
            size="sm"
            variant="outline"
            disabled={!source || busy}
            loading={busy && !preview}
            onClick={() => run(true)}
          >
            <Sparkles size={14} /> Preview
          </Button>
          <Button
            size="sm"
            colorPalette="blue"
            disabled={!source || busy}
            loading={busy}
            onClick={() => run(false)}
          >
            <Upload size={14} />{' '}
            {preview
              ? `Import ${preview.count} holding${preview.count === 1 ? '' : 's'}`
              : 'Import'}
          </Button>
        </HStack>
      </Flex>
      {hasHoldings && mode === 'replace' && (
        <Text fontSize="xs" color="fg.subtle">
          Replace removes every current holding, including ones added by hand.
        </Text>
      )}

      {failure && (
        <VStack align="stretch" gap={2}>
          <Callout tone="down" title="Nothing was imported">
            {failure.message}
          </Callout>
          <Diagnostics warnings={failure.warnings} skipped={failure.skipped} />
        </VStack>
      )}

      {preview && (
        <VStack align="stretch" gap={3}>
          <Flex justify="space-between" align="center" gap={2} wrap="wrap">
            <HStack gap={2}>
              <Text fontWeight="semibold" fontSize="sm">
                {preview.count} holding{preview.count === 1 ? '' : 's'} read from{' '}
                {preview.filename}
              </Text>
              <SignalBadge tone={preview.parser === 'llm' ? 'accent' : 'neutral'}>
                {parserLabel(preview.parser, preview.model_used)}
              </SignalBadge>
            </HStack>
            <Text fontSize="xs" color="fg.subtle">
              Nothing saved yet · format {preview.format}
            </Text>
          </Flex>
          <Diagnostics warnings={preview.warnings} skipped={preview.skipped} />
          <DataTable
            columns={previewColumns}
            rows={preview.holdings}
            rowKey={(row) => `${row.symbol}-${row.account ?? ''}-${row.currency ?? ''}-${row.quantity}`}
            size="sm"
            maxH="420px"
          />
        </VStack>
      )}
    </VStack>
  );
}
