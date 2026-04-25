import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  Input,
  NativeSelect,
  Spinner,
  Text,
  VStack,
  Badge,
  IconButton,
  Switch,
  Textarea,
} from '@chakra-ui/react';
import { SignalBadge, PageHeader, EmptyState, Surface } from '../components/ui/primitives';
import { Bell, Plus, Trash2, Send, RefreshCw, Save, CheckCircle, XCircle } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { api } from '../api';
import {
  AlertRule,
  AlertScope,
  ConditionGroup,
  NotificationChannel,
  NotificationHistoryItem,
  QuietHours,
  Watchlist,
  defaultCondition,
} from '../types';
import { ConditionBuilder, describeGroup } from '../components/alerts/ConditionBuilder';
import { toaster } from '../components/ui/toaster';

type TabId = 'watchlists' | 'rules' | 'channels' | 'inbox';

const TABS: { id: TabId; label: string }[] = [
  { id: 'watchlists', label: 'Watchlists' },
  { id: 'rules', label: 'Rules' },
  { id: 'channels', label: 'Channels' },
  { id: 'inbox', label: 'Inbox' },
];

const DOLLAR_SIGN = '$';
const MESSAGE_TEMPLATE_PLACEHOLDER = `{{symbol}} hit {{rule_name}} at ${DOLLAR_SIGN}{{price}} (RSI {{rsi}}, Δ {{change_pct}}%)`;

export const AlertsPage: React.FC = () => {
  const [tab, setTab] = useState<TabId>('watchlists');

  return (
    <Container maxW="page" py={{ base: 5, md: 8 }}>
      <PageHeader
        eyebrow="Notifications"
        icon={<Bell size={22} />}
        title="Alerts"
        subtitle="Get notified when watched stocks hit your defined conditions."
      />

      <Surface p={2} mb={4} variant="inset" overflowX="auto">
      <HStack gap={2} minW="max-content">
        {TABS.map(t => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? 'subtle' : 'ghost'}
            colorPalette={tab === t.id ? 'accent' : 'gray'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </HStack>
      </Surface>

      {tab === 'watchlists' && <WatchlistsTab />}
      {tab === 'rules' && <RulesTab />}
      {tab === 'channels' && <ChannelsTab />}
      {tab === 'inbox' && <InboxTab />}
    </Container>
  );
};

// ---------------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------------

const WatchlistsTab: React.FC = () => {
  const [items, setItems] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addSymbol, setAddSymbol] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const wls = await api.alerts.listWatchlists();
      setItems(wls);
      if (wls.length > 0 && !selectedId) setSelectedId(wls[0]._id || null);
    } catch (e: any) {
      toaster.create({ title: 'Failed to load watchlists', description: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = items.find(w => w._id === selectedId) || null;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const wl = await api.alerts.createWatchlist(newName.trim());
      setNewName('');
      setSelectedId(wl._id || null);
      reload();
    } catch (e: any) {
      toaster.create({ title: 'Create failed', description: e.message, type: 'error' });
    }
  };

  const handleAddSymbol = async () => {
    if (!selected?._id || !addSymbol.trim()) return;
    try {
      await api.alerts.addSymbol(selected._id, addSymbol.trim());
      setAddSymbol('');
      reload();
    } catch (e: any) {
      toaster.create({ title: 'Add failed', description: e.message, type: 'error' });
    }
  };

  const handleRemoveSymbol = async (sym: string) => {
    if (!selected?._id) return;
    await api.alerts.removeSymbol(selected._id, sym);
    reload();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this watchlist?')) return;
    await api.alerts.deleteWatchlist(id);
    if (selectedId === id) setSelectedId(null);
    reload();
  };

  if (loading) return <Spinner color="accent.solid" />;

  return (
    <Flex gap={4} align="stretch" direction={{ base: 'column', lg: 'row' }}>
      {/* Left: list */}
      <Surface w={{ base: '100%', lg: '300px' }} variant="raised" p={3} flexShrink={0}>
        <VStack align="stretch" gap={2} mb={3}>
          <Input
            size="sm"
            bg="bg.inset"
            color="fg.default"
            placeholder="New watchlist name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <Button size="sm" colorPalette="blue" onClick={handleCreate}>
            <Plus size={14} /> Create watchlist
          </Button>
        </VStack>
        <VStack align="stretch" gap={1}>
          {items.length === 0 && (
            <Text color="fg.subtle" fontSize="sm">No watchlists yet.</Text>
          )}
          {items.map(w => (
            <HStack
              key={w._id}
              bg={selectedId === w._id ? 'accent.muted' : 'bg.inset'}
              borderWidth="1px"
              borderColor={selectedId === w._id ? 'accent.emphasis' : 'border.subtle'}
              p={2}
              borderRadius="md"
              cursor="pointer"
              onClick={() => setSelectedId(w._id || null)}
              _hover={{ bg: selectedId === w._id ? 'accent.muted' : 'bg.muted' }}
            >
              <Text color="fg.default" fontWeight="medium" flex={1}>{w.name}</Text>
              <Badge colorPalette="gray">{w.symbols.length}</Badge>
              <IconButton
                size="xs"
                variant="ghost"
                colorPalette="red"
                aria-label="delete"
                onClick={e => { e.stopPropagation(); w._id && handleDelete(w._id); }}
              >
                <Trash2 size={12} />
              </IconButton>
            </HStack>
          ))}
        </VStack>
      </Surface>

      {/* Right: detail */}
      <Surface flex={1} variant="raised" p={4}>
        {!selected ? (
          <Text color="fg.muted">Select a watchlist to view its symbols.</Text>
        ) : (
          <VStack align="stretch" gap={3}>
            <Heading size="md" color="fg.default">{selected.name}</Heading>
            <HStack>
              <Input
                size="sm"
                bg="bg.inset"
                color="fg.default"
                placeholder="Add symbol (e.g. AAPL)"
                value={addSymbol}
                onChange={e => setAddSymbol(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleAddSymbol()}
              />
              <Button size="sm" colorPalette="blue" onClick={handleAddSymbol}>Add</Button>
            </HStack>
            <Flex wrap="wrap" gap={2}>
              {selected.symbols.length === 0 && (
                <Text color="fg.subtle" fontSize="sm">No symbols — add one above.</Text>
              )}
              {selected.symbols.map(sym => (
                <HStack key={sym} bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="sm" px={2} py={1}>
                  <RouterLink to={`/stocks/${sym}`}>
                    <Text color="accent.fg" fontWeight="semibold">{sym}</Text>
                  </RouterLink>
                  <IconButton
                    size="xs"
                    variant="ghost"
                    colorPalette="red"
                    aria-label="remove"
                    onClick={() => handleRemoveSymbol(sym)}
                  >
                    <Trash2 size={10} />
                  </IconButton>
                </HStack>
              ))}
            </Flex>
          </VStack>
        )}
      </Surface>
    </Flex>
  );
};

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const blankRule = (): Omit<AlertRule, '_id' | 'created_at' | 'updated_at'> => ({
  name: 'New rule',
  enabled: true,
  scope: { type: 'all_watched' },
  conditions: { op: 'and', children: [{ op: 'leaf', condition: defaultCondition('rsi_below') }] },
  cooldown_minutes: 60,
  quiet_hours: null,
  channel_ids: [],
  message_template: null,
  require_consecutive: 1,
});

const RulesTab: React.FC = () => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AlertRule | Omit<AlertRule, '_id' | 'created_at' | 'updated_at'> | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, w] = await Promise.all([
        api.alerts.listRules(),
        api.alerts.listChannels(),
        api.alerts.listWatchlists(),
      ]);
      setRules(r);
      setChannels(c);
      setWatchlists(w);
    } catch (e: any) {
      toaster.create({ title: 'Load failed', description: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleToggle = async (id: string) => {
    await api.alerts.toggleRule(id);
    reload();
  };
  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete rule?')) return;
    await api.alerts.deleteRule(id);
    reload();
  };
  const handleTest = async (id: string) => {
    const res = await api.alerts.testRule(id);
    if (res.success) {
      toaster.create({
        title: `Test sent for ${res.symbol}`,
        description: `${res.delivered?.filter(d => d.ok).length || 0}/${res.delivered?.length || 0} channels delivered`,
        type: 'success',
      });
    } else {
      toaster.create({ title: 'Test failed', description: res.error, type: 'error' });
    }
  };

  const handleSave = async (rule: AlertRule | Omit<AlertRule, '_id' | 'created_at' | 'updated_at'>) => {
    try {
      if ((rule as AlertRule)._id) {
        const { _id, created_at, updated_at, ...patch } = rule as AlertRule;
        await api.alerts.updateRule(_id!, patch);
      } else {
        await api.alerts.createRule(rule as any);
      }
      setEditing(null);
      reload();
      toaster.create({ title: 'Saved', type: 'success' });
    } catch (e: any) {
      toaster.create({ title: 'Save failed', description: e?.response?.data?.error || e.message, type: 'error' });
    }
  };

  if (loading) return <Spinner color="accent.solid" />;

  if (editing) {
    return (
      <RuleEditor
        value={editing}
        channels={channels}
        watchlists={watchlists}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <VStack align="stretch" gap={3}>
      <HStack justify="space-between">
        <Text color="fg.muted">{rules.length} rule{rules.length !== 1 ? 's' : ''}</Text>
        <Button size="sm" colorPalette="blue" onClick={() => setEditing(blankRule() as any)}>
          <Plus size={14} /> New rule
        </Button>
      </HStack>
      {rules.length === 0 && (
        <EmptyState
          icon={<Bell size={32} />}
          title="No rules yet"
          description="Create one to start getting alerted when stocks hit your conditions."
        />
      )}
      {rules.map(r => (
        <Surface key={r._id} p={4} variant="raised" borderColor={r.enabled ? 'signal.up.muted' : 'border.subtle'}>
          <HStack justify="space-between" mb={2}>
            <HStack>
              <SignalBadge tone={r.enabled ? 'up' : 'neutral'} size="sm">{r.enabled ? 'Enabled' : 'Paused'}</SignalBadge>
              <Text color="fg.default" fontWeight="bold" fontSize="lg">{r.name}</Text>
            </HStack>
            <HStack>
              <Button size="xs" variant="outline" onClick={() => handleTest(r._id!)}>
                <Send size={12} /> Test
              </Button>
              <Button size="xs" variant="outline" onClick={() => handleToggle(r._id!)}>
                {r.enabled ? 'Pause' : 'Enable'}
              </Button>
              <Button size="xs" variant="outline" onClick={() => setEditing(r)}>Edit</Button>
              <Button size="xs" variant="ghost" colorPalette="red" onClick={() => handleDelete(r._id!)}>
                <Trash2 size={12} />
              </Button>
            </HStack>
          </HStack>
          <Text color="fg.default" fontSize="sm" mb={1}>
            Scope: {describeScope(r.scope, watchlists)}
          </Text>
          <Text color="fg.muted" fontSize="xs" fontFamily="mono" mb={1}>
            {describeGroup(r.conditions)}
          </Text>
          <HStack gap={3} fontSize="xs" color="fg.subtle">
            <Text>Cooldown: {r.cooldown_minutes}m</Text>
            <Text>Hysteresis: {r.require_consecutive}x</Text>
            <Text>Channels: {r.channel_ids.length}</Text>
            {r.quiet_hours && (
              <Text>
                Quiet: {r.quiet_hours.start_hour}:00–{r.quiet_hours.end_hour}:00 {r.quiet_hours.tz || 'UTC'}
              </Text>
            )}
          </HStack>
        </Surface>
      ))}
    </VStack>
  );
};

function describeScope(s: AlertScope, watchlists: Watchlist[]): string {
  switch (s.type) {
    case 'all_watched': return 'All watched symbols';
    case 'watchlist': {
      const wl = watchlists.find(w => w._id === s.watchlist_id);
      return `Watchlist: ${wl?.name || s.watchlist_id}`;
    }
    case 'symbols': return `Symbols: ${s.symbols.join(', ') || '(none)'}`;
    case 'all_analyzed': return 'Every analyzed stock';
  }
}

// ---------------------------------------------------------------------------
// Rule editor
// ---------------------------------------------------------------------------

const RuleEditor: React.FC<{
  value: AlertRule | Omit<AlertRule, '_id' | 'created_at' | 'updated_at'>;
  channels: NotificationChannel[];
  watchlists: Watchlist[];
  onSave: (r: any) => void;
  onCancel: () => void;
}> = ({ value, channels, watchlists, onSave, onCancel }) => {
  const [rule, setRule] = useState(value);

  const setField = <K extends keyof typeof rule>(key: K, v: (typeof rule)[K]) => {
    setRule(prev => ({ ...prev, [key]: v }) as typeof prev);
  };

  const toggleChannel = (id: string) => {
    const cur = (rule as any).channel_ids as string[];
    const next = cur.includes(id) ? cur.filter(c => c !== id) : [...cur, id];
    setField('channel_ids', next as any);
  };

  return (
    <Surface p={4} variant="raised">
    <VStack align="stretch" gap={4}>
      <HStack justify="space-between">
        <Heading size="md" color="fg.default">
          {(rule as AlertRule)._id ? 'Edit rule' : 'New rule'}
        </Heading>
        <HStack>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="sm" colorPalette="blue" onClick={() => onSave(rule)}>
            <Save size={14} /> Save
          </Button>
        </HStack>
      </HStack>

      <Box>
        <Text color="fg.muted" fontSize="sm" mb={1}>Name</Text>
        <Input bg="bg.inset" color="fg.default" value={(rule as any).name} onChange={e => setField('name', e.target.value as any)} />
      </Box>

      <HStack gap={4}>
        <Box>
          <Text color="fg.muted" fontSize="sm" mb={1}>Enabled</Text>
          <Switch.Root
            checked={(rule as any).enabled}
            onCheckedChange={(d: { checked: boolean }) => setField('enabled', d.checked as any)}
          >
            <Switch.HiddenInput />
            <Switch.Control />
          </Switch.Root>
        </Box>
        <Box>
          <Text color="fg.muted" fontSize="sm" mb={1}>Cooldown (minutes)</Text>
          <Input
            type="number"
            w="120px"
            bg="bg.inset"
            color="fg.default"
            value={(rule as any).cooldown_minutes}
            onChange={e => setField('cooldown_minutes', (parseInt(e.target.value) || 0) as any)}
          />
        </Box>
        <Box>
          <Text color="fg.muted" fontSize="sm" mb={1}>Require consecutive</Text>
          <Input
            type="number"
            w="120px"
            bg="bg.inset"
            color="fg.default"
            min={1}
            value={(rule as any).require_consecutive}
            onChange={e => setField('require_consecutive', Math.max(1, parseInt(e.target.value) || 1) as any)}
          />
        </Box>
      </HStack>

      <Box>
        <Text color="fg.muted" fontSize="sm" mb={1}>Scope</Text>
        <HStack>
          <NativeSelect.Root size="sm" w="200px">
            <NativeSelect.Field
              value={(rule as any).scope.type}
              bg="bg.inset"
              color="fg.default"
              onChange={e => {
                const t = e.target.value as AlertScope['type'];
                const s: AlertScope =
                  t === 'watchlist'
                    ? { type: 'watchlist', watchlist_id: watchlists[0]?._id || '' }
                    : t === 'symbols'
                    ? { type: 'symbols', symbols: [] }
                    : { type: t as any };
                setField('scope', s as any);
              }}
            >
              <option value="all_watched">All watched</option>
              <option value="watchlist">Watchlist</option>
              <option value="symbols">Specific symbols</option>
              <option value="all_analyzed">Every analyzed stock</option>
            </NativeSelect.Field>
          </NativeSelect.Root>
          {(rule as any).scope.type === 'watchlist' && (
            <NativeSelect.Root size="sm" w="240px">
              <NativeSelect.Field
                value={(rule as any).scope.watchlist_id}
                bg="bg.inset"
                color="fg.default"
                onChange={e => setField('scope', { type: 'watchlist', watchlist_id: e.target.value } as any)}
              >
                {watchlists.length === 0 && <option value="">(no watchlists yet)</option>}
                {watchlists.map(w => (
                  <option key={w._id} value={w._id}>{w.name} ({w.symbols.length})</option>
                ))}
              </NativeSelect.Field>
            </NativeSelect.Root>
          )}
          {(rule as any).scope.type === 'symbols' && (
            <Input
              size="sm"
              bg="bg.inset"
              color="fg.default"
              placeholder="AAPL, MSFT, NVDA"
              value={((rule as any).scope.symbols || []).join(', ')}
              onChange={e =>
                setField(
                  'scope',
                  {
                    type: 'symbols',
                    symbols: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
                  } as any,
                )
              }
            />
          )}
        </HStack>
      </Box>

      <Box>
        <Text color="fg.muted" fontSize="sm" mb={2}>Conditions</Text>
        <ConditionBuilder
          value={(rule as any).conditions as ConditionGroup}
          onChange={c => setField('conditions', c as any)}
          isRoot
        />
      </Box>

      <Box>
        <Text color="fg.muted" fontSize="sm" mb={1}>Channels</Text>
        {channels.length === 0 ? (
          <Text color="fg.subtle" fontSize="sm">No channels configured. Add one on the Channels tab.</Text>
        ) : (
          <Flex wrap="wrap" gap={2}>
            {channels.map(c => {
              const selected = ((rule as any).channel_ids as string[]).includes(c._id || '');
              return (
                <Button
                  key={c._id}
                  size="sm"
                  variant={selected ? 'solid' : 'outline'}
                  colorPalette={selected ? 'blue' : 'gray'}
                  onClick={() => c._id && toggleChannel(c._id)}
                >
                  {c.name}
                </Button>
              );
            })}
          </Flex>
        )}
      </Box>

      <Box>
        <Text color="fg.muted" fontSize="sm" mb={1}>
          Message template (optional). Placeholders:{' '}
          <Text as="span" fontFamily="mono" color="fg.default">
            {'{{symbol}} {{price}} {{rsi}} {{change_pct}} {{rule_name}} {{matched}} {{52w_low}} {{52w_high}} {{market_cap}} {{sector}}'}
          </Text>
        </Text>
        <Textarea
          bg="bg.inset"
          color="fg.default"
          rows={3}
          placeholder={MESSAGE_TEMPLATE_PLACEHOLDER}
          value={(rule as any).message_template || ''}
          onChange={e => setField('message_template', (e.target.value || null) as any)}
        />
      </Box>

      <Box>
        <Text color="fg.muted" fontSize="sm" mb={1}>Quiet hours (UTC)</Text>
        <HStack>
          <Switch.Root
            checked={!!(rule as any).quiet_hours}
            onCheckedChange={(d: { checked: boolean }) => {
              setField(
                'quiet_hours',
                (d.checked ? { start_hour: 22, end_hour: 7, tz: 'UTC' } : null) as any,
              );
            }}
          >
            <Switch.HiddenInput />
            <Switch.Control />
          </Switch.Root>
          {(rule as any).quiet_hours && (
            <>
              <Input
                type="number"
                w="100px"
                bg="bg.inset"
                color="fg.default"
                min={0}
                max={23}
                value={((rule as any).quiet_hours as QuietHours).start_hour}
                onChange={e =>
                  setField('quiet_hours', {
                    ...(rule as any).quiet_hours,
                    start_hour: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)),
                  } as any)
                }
              />
              <Text color="fg.muted">–</Text>
              <Input
                type="number"
                w="100px"
                bg="bg.inset"
                color="fg.default"
                min={0}
                max={23}
                value={((rule as any).quiet_hours as QuietHours).end_hour}
                onChange={e =>
                  setField('quiet_hours', {
                    ...(rule as any).quiet_hours,
                    end_hour: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)),
                  } as any)
                }
              />
              <Text color="fg.subtle" fontSize="xs">(hours, UTC; wraps midnight if start &gt; end)</Text>
            </>
          )}
        </HStack>
      </Box>
    </VStack>
    </Surface>
  );
};

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

const ChannelsTab: React.FC = () => {
  const [items, setItems] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newUsername, setNewUsername] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.alerts.listChannels());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleCreate = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    try {
      await api.alerts.createChannel(newName.trim(), {
        webhook_url: newUrl.trim(),
        username: newUsername.trim() || undefined,
      });
      setNewName(''); setNewUrl(''); setNewUsername('');
      reload();
    } catch (e: any) {
      toaster.create({ title: 'Create failed', description: e?.response?.data?.error || e.message, type: 'error' });
    }
  };

  const handleTest = async (id: string) => {
    const res = await api.alerts.testChannel(id);
    if (res.success) {
      toaster.create({ title: 'Test sent', description: 'Check Discord for the test embed.', type: 'success' });
    } else {
      toaster.create({ title: 'Test failed', description: res.error, type: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete channel?')) return;
    await api.alerts.deleteChannel(id);
    reload();
  };

  const handleToggleEnabled = async (c: NotificationChannel) => {
    if (!c._id) return;
    await api.alerts.updateChannel(c._id, { enabled: !c.enabled });
    reload();
  };

  if (loading) return <Spinner color="accent.solid" />;

  return (
    <VStack align="stretch" gap={4}>
      <Surface p={4} variant="raised">
        <Heading size="sm" color="fg.default" mb={2}>Add Discord webhook</Heading>
        <VStack align="stretch" gap={2}>
          <Input size="sm" bg="bg.inset" color="fg.default" placeholder="Channel name (e.g. #alerts)" value={newName} onChange={e => setNewName(e.target.value)} />
          <Input size="sm" bg="bg.inset" color="fg.default" placeholder="https://discord.com/api/webhooks/..." value={newUrl} onChange={e => setNewUrl(e.target.value)} />
          <Input size="sm" bg="bg.inset" color="fg.default" placeholder="Username override (optional)" value={newUsername} onChange={e => setNewUsername(e.target.value)} />
          <Button size="sm" colorPalette="blue" onClick={handleCreate}>
            <Plus size={14} /> Add channel
          </Button>
        </VStack>
      </Surface>

      {items.length === 0 && <Text color="fg.muted">No channels yet.</Text>}
      {items.map(c => (
        <Surface key={c._id} p={4} variant="raised">
          <HStack justify="space-between">
            <HStack>
              <SignalBadge tone={c.enabled ? 'up' : 'neutral'} size="sm">{c.enabled ? 'enabled' : 'disabled'}</SignalBadge>
              <Text color="fg.default" fontWeight="bold">{c.name}</Text>
              <Badge colorPalette="blue">{c.kind}</Badge>
            </HStack>
            <HStack>
              <Button size="xs" variant="outline" onClick={() => handleTest(c._id!)}>
                <Send size={12} /> Test
              </Button>
              <Button size="xs" variant="outline" onClick={() => handleToggleEnabled(c)}>
                {c.enabled ? 'Disable' : 'Enable'}
              </Button>
              <Button size="xs" variant="ghost" colorPalette="red" onClick={() => handleDelete(c._id!)}>
                <Trash2 size={12} />
              </Button>
            </HStack>
          </HStack>
          <Text color="fg.subtle" fontSize="xs" fontFamily="mono" mt={1}>
            {c.webhook_url}
          </Text>
        </Surface>
      ))}
    </VStack>
  );
};

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

const InboxTab: React.FC = () => {
  const [items, setItems] = useState<NotificationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.alerts.listHistory({ page_size: 100 });
      setItems(r.history);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const grouped = useMemo(() => {
    const by: Record<string, NotificationHistoryItem[]> = {};
    for (const it of items) {
      const day = new Date(it.created_at).toLocaleDateString();
      (by[day] ||= []).push(it);
    }
    return by;
  }, [items]);

  const markRead = async (id: string) => {
    await api.alerts.markRead(id, true);
    setItems(prev => prev.map(p => p._id === id ? { ...p, read: true } : p));
  };

  if (loading) return <Spinner color="accent.solid" />;

  return (
    <VStack align="stretch" gap={4}>
      <HStack justify="space-between">
        <Text color="fg.muted">{items.length} notifications</Text>
        <Button size="sm" variant="outline" onClick={reload}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </HStack>
      {items.length === 0 && (
        <EmptyState
          icon={<Bell size={32} />}
          title="Inbox is empty"
          description="When your rules fire, entries will show up here."
        />
      )}
      {Object.entries(grouped).map(([day, entries]) => (
        <Box key={day}>
          <Text color="fg.muted" fontSize="sm" fontWeight="bold" mb={2}>{day}</Text>
          <VStack align="stretch" gap={2}>
            {entries.map(e => (
              <Surface
                key={e._id}
                variant={e.read ? 'inset' : 'raised'}
                p={3}
                borderColor={e.read ? 'border.subtle' : 'accent.emphasis'}
                onClick={() => e._id && !e.read && markRead(e._id)}
                cursor={e.read ? 'default' : 'pointer'}
              >
                <HStack justify="space-between" mb={1}>
                  <HStack>
                    {!e.read && <Badge colorPalette="blue">new</Badge>}
                    <RouterLink to={`/stocks/${e.symbol}`}>
                      <Text color="accent.fg" fontWeight="bold">{e.symbol}</Text>
                    </RouterLink>
                    <Text color="fg.default">{e.rule_name}</Text>
                  </HStack>
                  <Text color="fg.subtle" fontSize="xs">{new Date(e.created_at).toLocaleTimeString()}</Text>
                </HStack>
                <Text color="fg.default" fontSize="sm" mb={1}>{e.message}</Text>
                <HStack gap={1} wrap="wrap" mb={1}>
                  {e.matched_conditions.map((m, i) => (
                    <Badge key={i} colorPalette="gray" size="sm">{m}</Badge>
                  ))}
                </HStack>
                <HStack gap={2}>
                  {e.delivered.map((d, i) => (
                    <HStack key={i} gap={1}>
                      {d.ok
                        ? <Box color="signal.up.fg"><CheckCircle size={12} /></Box>
                        : <Box color="signal.down.fg"><XCircle size={12} /></Box>}
                      <Text fontSize="xs" color={d.ok ? 'signal.up.fg' : 'signal.down.fg'}>{d.channel_name}</Text>
                    </HStack>
                  ))}
                </HStack>
              </Surface>
            ))}
          </VStack>
        </Box>
      ))}
    </VStack>
  );
};

