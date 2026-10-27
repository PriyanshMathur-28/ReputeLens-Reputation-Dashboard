import { createContext, useContext, useState, type ReactNode, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Bot, Building2, Check,
  ChevronDown, CircleHelp, Compass, FileText, Globe2, MessageCircle, Network, Plus, Radar,
  RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Target, Users, Waves, Zap
} from 'lucide-react';
import type { DailyPoint } from '@workspace/api-client-react';
import {
  useHealthCheck, useGetSystemStatus, useGetBrands, useGetOverview, useGetSentimentTimeseries,
  useGetMentions, useGetTopics, useGetAlerts, useGetNetworkGraph, useGetCompetitorBenchmark,
  useGetGeography, useGetResponseActions, useCreateResponseAction, useAskReputeLens,
  useExplainSpike, useSimulateSpread, useGetModelEvaluation, useGetSettings, useUpdateSettings,
  getGetOverviewQueryKey, getGetResponseActionsQueryKey, getGetSettingsQueryKey
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const BrandContext = createContext<{ brandId?: number; setBrandId: (id?: number) => void }>({ setBrandId: () => undefined });
const useBrand = () => useContext(BrandContext);

const navGroups = [
  { label: 'INTELLIGENCE', links: [
    ['/', 'Overview', BarChart3], ['/sentiment', 'Sentiment', Activity], ['/narratives', 'Narratives', MessageCircle],
    ['/network', 'Conversation network', Network], ['/crisis', 'Crisis room', ShieldCheck]
  ] },
  { label: 'STRATEGY', links: [
    ['/simulate', 'Spread simulation', Waves], ['/competitors', 'Competitors', Building2], ['/responses', 'Responses', Check],
    ['/ask', 'Ask ReputeLens', CircleHelp]
  ] },
  { label: 'REPORTING', links: [
    ['/reports', 'Executive brief', FileText], ['/geography', 'Geography', Globe2], ['/evaluation', 'Model evaluation', Target],
    ['/settings', 'Settings', Settings2]
  ] }
] as const;

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: brands } = useGetBrands();
  const { data: status } = useGetSystemStatus();
  const [brandId, setBrandId] = useState<number | undefined>();
  const selected = brands?.find((brand) => brand.id === brandId) ?? brands?.find((brand) => brand.is_primary) ?? brands?.[0];
  const currentBrandId = brandId ?? selected?.id;
  return (
    <BrandContext.Provider value={{ brandId: currentBrandId, setBrandId }}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brandmark"><span className="brand-icon">R</span><span>ReputeLens</span></div>
          {navGroups.map((group) => <div key={group.label}>
            <div className="nav-section">{group.label}</div>
            {group.links.map(([href, label, Icon]) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-nav-${href === '/' ? 'overview' : href.slice(1)}`} aria-label={label}>
              <Icon size={16} strokeWidth={1.8} /><span>{label}</span>
            </Link>)}
          </div>)}
          <div className="sidebar-foot"><span className="live-dot" /><span>{status?.provider ? `${status.provider} connected` : 'Monitoring active'}</span></div>
        </aside>
        <main className="main-area">
          <header className="topbar">
            <div className="topbar-left"><span>WORKSPACE</span><span>/</span><strong>{selected?.name ?? 'All brands'}</strong></div>
            <div className="topbar-right">
              <select className="select" aria-label="Select brand" data-testid="select-active-brand" value={selected?.id ?? ''} onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : undefined)}>
                {!brands?.length && <option value="">Loading brands…</option>}
                {brands?.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}{brand.is_primary ? ' · primary' : ''}</option>)}
              </select>
              <span className="date-chip">Last 30 days <ChevronDown size={12} style={{ verticalAlign: 'middle', marginLeft: 5 }} /></span>
              <span className="avatar-chip" title="ReputeLens analyst">RL</span>
            </div>
          </header>
          {children}
        </main>
      </div>
    </BrandContext.Provider>
  );
}

function Page({ title, subtitle, eyebrow = 'SIGNAL DESK', children, action }: { title: string; subtitle: string; eyebrow?: string; children: ReactNode; action?: ReactNode }) {
  return <div className="content flash"><div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action && <div className="head-actions">{action}</div>}</div>{children}</div>;
}
function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return <section className={`panel panel-pad ${className}`}><div className="panel-head"><div><h2 className="panel-title">{title}</h2>{note && <div className="panel-note">{note}</div>}</div>{children && null}</div>{children}</section>;
}
function LoadState({ loading, error, empty, children, retry }: { loading: boolean; error: unknown; empty: boolean; children: ReactNode; retry?: () => void }) {
  if (loading) return <div className="panel loading-box" aria-label="Loading"><div className="skeleton" style={{ width: '35%' }} /><div className="skeleton" style={{ width: '88%', height: 42 }} /><div className="skeleton" style={{ width: '70%' }} /></div>;
  if (error) return <div className="panel error-state" role="alert"><div><AlertTriangle size={18} style={{ marginBottom: 8 }} /></div><div>We couldn’t load this signal right now.</div><button className="button" data-testid="button-retry-load" onClick={retry}><RefreshCw size={13} /> Try again</button></div>;
  if (empty) return <div className="panel empty-state"><div className="section-label">NO SIGNAL YET</div><p>There is nothing to show for this view.</p></div>;
  return <>{children}</>;
}
function Metric({ label, value, delta, icon: Icon, tone = 'up' }: { label: string; value: string | number; delta?: string; icon?: typeof Activity; tone?: string }) {
  return <div className="panel metric-card" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-label">{label}</div>{Icon && <Icon className="metric-glyph" size={17} strokeWidth={1.7} />}<div className="metric-value">{value}</div><div className={`metric-foot ${tone === 'down' ? 'delta-down' : 'delta-up'}`}>{delta && (tone === 'down' ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />)}{delta}</div></div>;
}
function SentimentChart({ points }: { points: DailyPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.volume));
  const width = 760, height = 220, left = 36, right = 12, top = 14, bottom = 28;
  const plotW = width - left - right, plotH = height - top - bottom;
  const coords = points.map((p, i) => ({ x: left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotW), y: top + plotH - (p.volume / max) * plotH, point: p }));
  const path = coords.map((c, i) => `${i ? 'L' : 'M'} ${c.x} ${c.y}`).join(' ');
  return <div className="chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mentions volume over time">
    {[0, 1, 2, 3].map((line) => <g key={line}><line x1={left} x2={width - right} y1={top + line * (plotH / 3)} y2={top + line * (plotH / 3)} className="chart-grid" /><text x="0" y={top + line * (plotH / 3) + 3} className="chart-label">{Math.round(max * (1 - line / 3))}</text></g>)}
     {coords.length > 0 && <><path d={`${path} L ${coords.at(-1)?.x} ${top + plotH} L ${coords[0].x} ${top + plotH} Z`} fill="#1d7564" opacity=".08" /><path d={path} fill="none" stroke="#1d7564" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />{coords.map((c, i) => <g key={c.point.date}><circle cx={c.x} cy={c.y} r={c.point.event ? 4 : 2.4} fill={c.point.event ? '#d2a34d' : '#1d7564'} /><title>{`${c.point.date.slice(0, 10)}: ${c.point.volume} mentions${c.point.event ? ` · ${c.point.event}` : ''}`}</title>{(i === 0 || i === coords.length - 1 || i === Math.floor(coords.length / 2)) && <text x={c.x} y={height - 5} textAnchor="middle" className="chart-label">{c.point.date.slice(5, 10)}</text>}</g>)}</>}
  </svg></div>;
}
function SentimentLegend() { return <div className="legend"><span><i style={{ background: '#1d7564' }} />Mention volume</span><span><i style={{ background: '#d2a34d' }} />Notable event</span></div>; }
function apiRetry(query: { refetch: () => unknown }) { return () => { void query.refetch(); }; }
function tableBlank(length: number) { return !length; }
function formatNum(value?: number) { return value == null ? '—' : Intl.NumberFormat('en', { notation: value > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value); }
function formatDecimal(value?: number, digits = 1) { return value == null ? '—' : Number(value).toFixed(digits); }
function formatSigned(value?: number, digits = 1) { return value == null ? '0' : `${value > 0 ? '+' : ''}${Number(value).toFixed(digits)}`; }
function todayLabel() { return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase(); }
function sentimentTag(sentiment: string) { const cls = sentiment === 'negative' ? 'red' : sentiment === 'positive' ? '' : 'gray'; return <span className={`tag ${cls}`}>{sentiment}</span>; }

function OverviewPage() {
  const { brandId } = useBrand();
  const overview = useGetOverview({ brand_id: brandId, days: 30 });
  const series = useGetSentimentTimeseries({ brand_id: brandId, days: 30 });
  const mentions = useGetMentions({ brand_id: brandId, page: 1, page_size: 5, sort: 'priority' });
  const alerts = useGetAlerts({ brand_id: brandId, status: 'open' });
  const topics = useGetTopics({ brand_id: brandId });
  const explain = useExplainSpike();
  const queryClient = useQueryClient();
  const item = overview.data;
  const primaryError = overview.error || series.error || mentions.error;
  const items = mentions.data?.items ?? [];
  return <Page title="Reputation, in focus." subtitle="A live read on what people are saying — and what your team should do next." eyebrow={`${todayLabel()} · COMMAND VIEW`} action={<button className="button" data-testid="button-refresh-overview" onClick={() => { void overview.refetch(); void series.refetch(); void mentions.refetch(); }}><RefreshCw size={13} /> Refresh signals</button>}>
    {primaryError ? <LoadState loading={false} error={primaryError} empty={false} retry={apiRetry(overview)}>{null}</LoadState> : overview.isLoading || series.isLoading || mentions.isLoading ? <LoadState loading error={null} empty={false}>{null}</LoadState> : <>
      <div className="metric-grid">
        <Metric label="Reputation health" value={item?.health.score ?? '—'} delta={`${formatSigned(item?.health.delta)} pts vs prior period`} icon={ShieldCheck} tone={item?.health.delta != null && item.health.delta < 0 ? 'down' : 'up'} />
        <Metric label="Crisis exposure" value={item?.crisis.risk ?? '—'} delta={`${item?.crisis.band ?? 'No band'} risk band`} icon={Radar} tone={item?.crisis.risk && item.crisis.risk > 25 ? 'down' : 'up'} />
        <Metric label="Mentions analyzed" value={formatNum(item?.kpis.mentions?.value)} delta={`${formatDecimal(item?.kpis.mentions?.delta_pct)}% vs prior period`} icon={MessageCircle} />
        <Metric label="Net sentiment" value={formatDecimal(item?.kpis.net_sentiment?.value)} delta={`${formatDecimal(item?.kpis.net_sentiment?.delta_pct)}% trend`} icon={Activity} tone={item?.kpis.net_sentiment?.delta_pct != null && item.kpis.net_sentiment.delta_pct < 0 ? 'down' : 'up'} />
        <Metric label="Estimated reach" value={formatNum(item?.kpis.reach?.value)} delta={`${formatDecimal(item?.kpis.reach?.delta_pct)}% vs prior period`} icon={Users} />
      </div>
      <div className="two-col">
        <Panel title="Conversation volume" note="Daily mentions · current period"><SentimentLegend /><SentimentChart points={series.data ?? []} /></Panel>
        <Panel title="Risk watch" note="Open signals that need a human read">
          {alerts.data?.length ? alerts.data.slice(0, 4).map((alert) => <div className="list-row" key={alert.id} data-testid={`alert-preview-${alert.id}`}><div><div style={{ fontWeight: 600, fontSize: 12 }}>{alert.title}</div><div className="text-muted" style={{ marginTop: 4, fontSize: 10 }}>{alert.type} · {new Date(alert.created_at).toLocaleDateString()}</div></div><span className={`tag ${alert.severity === 'critical' || alert.severity === 'high' ? 'red' : 'gold'}`}>{alert.severity}</span></div>) : <div className="empty-state">No open alerts. Keep the watch running.</div>}
          <Link href="/crisis" className="button" data-testid="link-view-crisis" style={{ marginTop: 12, textDecoration: 'none' }}>Open crisis room <ArrowUpRight size={13} /></Link>
        </Panel>
      </div>
      <div className="two-col">
        <Panel title="Priority mentions" note="Ranked by urgency and estimated reach">
          {items.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Signal</th><th>Source</th><th>Read</th><th>Priority</th></tr></thead><tbody>{items.map((m) => <tr key={m.id} data-testid={`row-priority-mention-${m.id}`}><td><strong>{m.author}</strong><div className="text-muted" style={{ maxWidth: 330, marginTop: 4 }}>{m.text}</div></td><td>{m.source}</td><td>{sentimentTag(m.sentiment)}</td><td className="mini-stat">{m.priority_score}</td></tr>)}</tbody></table></div> : <div className="empty-state">No priority mentions in this period.</div>}
        </Panel>
        <Panel title="Narratives gaining momentum" note="Emerging topics worth watching">
          {topics.data?.filter((topic) => topic.is_emerging).slice(0, 4).map((topic) => <div className="list-row" key={topic.id} data-testid={`topic-preview-${topic.id}`}><div><div style={{ fontWeight: 600, fontSize: 12 }}>{topic.label}</div><div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>{formatNum(topic.mention_count)} mentions · {topic.negative_share}% negative</div></div><span className="tag gold">+{topic.growth_rate}%</span></div>)}
          {!topics.data?.some((topic) => topic.is_emerging) && <div className="empty-state">No emerging narrative detected.</div>}
          <Link href="/narratives" className="button" data-testid="link-view-narratives" style={{ marginTop: 12, textDecoration: 'none' }}>Explore narratives <ArrowUpRight size={13} /></Link>
        </Panel>
      </div>
      <div className="event-callout"><Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />The strongest signals are ranked by reach, velocity, and risk context — not just volume.</div>
      {series.data?.some((point) => point.event) && <button className="button" data-testid="button-explain-spike" disabled={explain.isPending} style={{ marginTop: 12 }} onClick={() => { const spike = series.data?.find((p) => p.event); if (spike && brandId) explain.mutate({ data: { brand_id: brandId, date: spike.date } }); }}><Sparkles size={13} />{explain.isPending ? 'Reading spike…' : 'Explain notable spike'}</button>}
      {explain.data && <Panel title={explain.data.headline} note="Spike explanation"><p>{explain.data.what_happened}</p><div className="section-label">Suggested next step</div><p>{explain.data.recommended_next_step}</p></Panel>}
      {explain.isSuccess && <span data-testid="status-spike-explanation">Spike analysis ready</span>}
    </>}
  </Page>;
}

function SentimentPage() {
  const { brandId } = useBrand();
  const [filter, setFilter] = useState('');
  const points = useGetSentimentTimeseries({ brand_id: brandId, days: 30 });
  const mentions = useGetMentions({ brand_id: brandId, page: 1, page_size: 50, sentiment: filter ? filter as 'positive' | 'negative' | 'neutral' : undefined, sort: 'priority' });
  return <Page title="Sentiment & aspect analysis" subtitle="Separate the emotional weather from the specific issues driving it." eyebrow="SIGNAL ANALYSIS">
    <div className="two-col">
      <Panel title="Daily conversation" note="Mentions through the selected period"><SentimentLegend /><LoadState loading={points.isLoading} error={points.error} empty={!points.data?.length} retry={apiRetry(points)}><SentimentChart points={points.data ?? []} /></LoadState></Panel>
      <Panel title="Health components" note="Inputs behind the current reputation score"><LoadState loading={false} error={null} empty={!points.data?.length}>{points.data?.slice(-5).map((p) => <div className="list-row" key={p.date}><span>{p.date}</span><span className="mini-stat">{p.health_score}</span></div>)}</LoadState></Panel>
    </div>
    <Panel title="Mention stream" note="Filter by sentiment to inspect the underlying evidence">
      <div className="head-actions" style={{ marginBottom: 14 }}><select className="select" data-testid="select-sentiment-filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All sentiment</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></select></div>
      <LoadState loading={mentions.isLoading} error={mentions.error} empty={!mentions.data?.items.length} retry={apiRetry(mentions)}>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Author / message</th><th>Source</th><th>Sentiment</th><th>Aspects</th><th>Reach</th></tr></thead><tbody>{mentions.data?.items.map((m) => <tr key={m.id} data-testid={`row-mention-${m.id}`}><td><strong>{m.author}</strong><div className="text-muted" style={{ maxWidth: 480, marginTop: 4 }}>{m.text}</div></td><td>{m.source}</td><td>{sentimentTag(m.sentiment)}</td><td>{m.aspects.join(', ') || '—'}</td><td>{formatNum(m.reach_estimate)}</td></tr>)}</tbody></table></div>
      </LoadState>
    </Panel>
  </Page>;
}

function NarrativesPage() {
  const { brandId } = useBrand();
  const topics = useGetTopics({ brand_id: brandId });
  const [selected, setSelected] = useState<number | undefined>();
  const chosen = topics.data?.find((t) => t.id === selected) ?? topics.data?.[0];
  return <Page title="Narratives in motion" subtitle="See the conversation themes forming beneath the headline numbers." eyebrow="TOPIC DISCOVERY">
    <LoadState loading={topics.isLoading} error={topics.error} empty={!topics.data?.length} retry={apiRetry(topics)}>
      <div className="two-col"><Panel title="Narrative landscape" note="Bubble size reflects mention count">
        <div className="topic-cloud">{topics.data?.map((topic) => <button className={`topic-bubble ${topic.mention_count > 150 ? 'large' : topic.mention_count > 60 ? 'medium' : ''}`} key={topic.id} onClick={() => setSelected(topic.id)} data-testid={`button-topic-${topic.id}`} style={selected === topic.id ? { borderColor: '#1d7564', background: '#eaf3ec' } : undefined}>{topic.label}</button>)}</div>
        <div className="legend"><span><i style={{ background: '#d2a34d' }} />Emerging themes are highlighted by momentum</span></div>
      </Panel><Panel title={chosen?.label ?? 'Select a narrative'} note="Evidence summary">
        {chosen ? <><p style={{ fontSize: 13, lineHeight: 1.7, color: '#65736e' }}>{chosen.summary}</p><div className="splitline" /><div className="list-row"><span>Mentions</span><b>{formatNum(chosen.mention_count)}</b></div><div className="list-row"><span>Average sentiment</span><b>{chosen.avg_sentiment}</b></div><div className="list-row"><span>Negative share</span><b>{chosen.negative_share}%</b></div><div className="list-row"><span>Growth</span><b className="delta-up">+{chosen.growth_rate}%</b></div>{chosen.is_emerging && <span className="tag gold">Emerging · {chosen.emerged_on ?? 'recently'}</span>}<div className="splitline" /><div className="section-label">Keywords</div><p>{chosen.keywords?.map((keyword) => <span className="tag gray" key={keyword} style={{ margin: '7px 5px 0 0' }}>{keyword}</span>)}</p></> : null}
      </Panel></div>
      <Panel title="All narratives" note={`${topics.data?.length ?? 0} active conversation themes`}><div className="table-wrap"><table className="data-table"><thead><tr><th>Narrative</th><th>Mentions</th><th>Sentiment</th><th>Negative share</th><th>Momentum</th></tr></thead><tbody>{topics.data?.map((t) => <tr key={t.id} data-testid={`row-topic-${t.id}`}><td><strong>{t.label}</strong><div className="text-muted">{t.summary}</div></td><td>{formatNum(t.mention_count)}</td><td>{t.avg_sentiment}</td><td>{t.negative_share}%</td><td><span className={`tag ${t.is_emerging ? 'gold' : ''}`}>{t.is_emerging ? 'Emerging' : `${t.growth_rate}%`}</span></td></tr>)}</tbody></table></div></Panel>
    </LoadState>
  </Page>;
}

function NetworkPage() {
  const { brandId } = useBrand();
  const graph = useGetNetworkGraph({ brand_id: brandId, limit: 100 });
  const coords = [[50,45],[30,31],[68,29],[23,62],[76,65],[46,20],[56,78],[37,73],[84,44],[15,43],[64,53],[34,48],[49,62],[75,18],[20,79]];
  return <Page title="Who moves the conversation" subtitle="Map the voices, clusters, and coordination patterns shaping public opinion." eyebrow="INFLUENCE & COMMUNITIES">
    <div className="metric-grid"><Metric label="Accounts mapped" value={formatNum(graph.data?.nodes.length)} icon={Users} /><Metric label="Coordinated accounts" value={graph.data?.coordinated_accounts ?? '—'} delta="Requires human review" icon={Bot} tone="down" /><Metric label="Connections" value={formatNum(graph.data?.links.length)} icon={Network} /><Metric label="Communities" value={new Set(graph.data?.nodes.map((node) => node.community) ?? []).size || '—'} icon={Compass} /></div>
    <LoadState loading={graph.isLoading} error={graph.error} empty={!graph.data?.nodes.length} retry={apiRetry(graph)}>
      <div className="two-col"><Panel title="Influence graph" note="Node size indicates influence · select a voice to inspect"><div className="network-canvas">{graph.data?.links.slice(0, 35).map((link, i) => { const a = coords[link.source % coords.length], b = coords[link.target % coords.length]; return <svg key={`${link.source}-${link.target}-${i}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none"><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#9bb5a7" strokeOpacity=".42" strokeWidth={Math.max(.2, link.weight / 4)} /></svg>; })}{graph.data?.nodes.slice(0, coords.length).map((node, i) => { const size = Math.max(25, Math.min(50, 22 + node.influence_score / 4)); return <div key={node.id} className="node" data-testid={`node-network-${node.id}`} title={`${node.handle} · ${node.role} · influence ${node.influence_score}`} style={{ left: `${coords[i][0]}%`, top: `${coords[i][1]}%`, width: size, height: size, background: node.bot_likelihood > 65 ? '#bc665a' : ['#277a68','#d1a248','#537d91','#7b8f70'][node.community % 4] }}>{node.handle.slice(0, 2)}</div>; })}</div><div className="legend" style={{ marginTop: 14 }}><span><i style={{ background: '#277a68' }} />Organic voices</span><span><i style={{ background: '#bc665a' }} />Elevated coordination signal</span></div></Panel>
      <Panel title="High-influence voices" note="Ranked by influence score">{graph.data?.nodes.slice().sort((a, b) => b.influence_score - a.influence_score).slice(0, 7).map((node) => <div className="list-row" key={node.id} data-testid={`voice-${node.id}`}><div><strong style={{ fontSize: 12 }}>{node.handle}</strong><div className="text-muted" style={{ fontSize: 10, marginTop: 3 }}>{node.role} · {formatNum(node.followers)} followers</div></div><span className={`tag ${node.bot_likelihood > 65 ? 'red' : ''}`}>{node.influence_score}</span></div>)}</Panel></div>
    </LoadState>
  </Page>;
}

function CrisisPage() {
  const { brandId } = useBrand();
  const alerts = useGetAlerts({ brand_id: brandId });
  const overview = useGetOverview({ brand_id: brandId, days: 30 });
  const explain = useExplainSpike();
  const [status, setStatus] = useState('');
  const alertItems = alerts.data ?? [];
  return <Page title="Crisis room" subtitle="Triage fast-moving risk with evidence, context, and a clear next move." eyebrow="RISK OPERATIONS">
    <div className="metric-grid"><Metric label="Exposure score" value={overview.data?.crisis.risk ?? '—'} delta={`${overview.data?.crisis.band ?? '—'} band`} icon={AlertTriangle} tone="down" /><Metric label="Open alerts" value={alertItems.filter((a) => a.status === 'open').length} icon={Bell} /><Metric label="Acknowledged" value={alertItems.filter((a) => a.status === 'acknowledged').length} icon={Check} /><Metric label="Evidence mentions" value={formatNum(alertItems.reduce((n, a) => n + (a.evidence?.length ?? 0), 0))} icon={Search} /></div>
    <LoadState loading={alerts.isLoading || overview.isLoading} error={alerts.error || overview.error} empty={!alertItems.length} retry={apiRetry(alerts)}>
      <div style={{ display: 'grid', gap: 12 }}>{alertItems.map((alert) => <section className="panel panel-pad" key={alert.id} data-testid={`card-alert-${alert.id}`}><div className="panel-head"><div><span className={`tag ${alert.severity === 'critical' || alert.severity === 'high' ? 'red' : 'gold'}`}>{alert.severity}</span><span className="tag gray" style={{ marginLeft: 7 }}>{alert.status}</span><h2 className="panel-title" style={{ fontSize: 16, marginTop: 10 }}>{alert.title}</h2><div className="panel-note">{alert.type} · {new Date(alert.created_at).toLocaleString()}</div></div><div className="mini-stat">{alert.metric_value} <span className="text-muted">/ {alert.threshold}</span></div></div><p style={{ fontSize: 13, color: '#687670', lineHeight: 1.6 }}>{alert.description}</p><div className="section-label">Evidence · {alert.evidence?.length ?? 0} mentions</div>{alert.evidence?.slice(0, 2).map((m) => <div className="event-callout" key={m.id} style={{ marginTop: 8 }}>{m.text} <span className="text-muted">— {m.author}</span></div>)}<div className="head-actions" style={{ marginTop: 13 }}><button className="button" data-testid={`button-explain-alert-${alert.id}`} disabled={explain.isPending || !brandId} onClick={() => explain.mutate({ data: { brand_id: brandId!, date: alert.created_at.slice(0, 10) } })}><Sparkles size={13} /> Explain signal</button><button className="button" data-testid={`button-acknowledge-alert-${alert.id}`} onClick={() => setStatus(`Alert ${alert.id} marked for team follow-up.`)}><Check size={13} /> Acknowledge</button></div></section>)}</div>
    </LoadState>
    {explain.data && <Panel title={explain.data.headline} note="AI-assisted spike context"><p>{explain.data.what_happened}</p><div className="section-label">Recommended next step</div><p>{explain.data.recommended_next_step}</p></Panel>}
    {status && <div className="event-callout" data-testid="status-alert-action" style={{ marginTop: 12 }}>{status} This action is a local follow-up note; alert status changes are not available from the API.</div>}
  </Page>;
}

function SimulatePage() {
  const { brandId } = useBrand();
  const mutation = useSimulateSpread();
  const [steps, setSteps] = useState(8);
  const [runs, setRuns] = useState(120);
  const result = mutation.data;
  const max = Math.max(1, ...(result?.series.map((line) => line.expected_reach) ?? [1]));
  return <Page title="Test the response before it ships" subtitle="Compare how different response strategies may travel through the conversation." eyebrow="INFORMATION SPREAD LAB">
    <div className="two-col"><Panel title="Scenario parameters" note="Keep the experiment grounded in current network signals"><form onSubmit={(e) => { e.preventDefault(); if (brandId) mutation.mutate({ data: { brand_id: brandId, steps, runs } }); }}><label className="section-label">Propagation steps</label><input className="field" type="number" min={1} max={20} value={steps} onChange={(e) => setSteps(Number(e.target.value))} data-testid="input-simulation-steps" style={{ width: '100%', margin: '7px 0 15px' }} /><label className="section-label">Simulation runs</label><input className="field" type="number" min={10} max={500} value={runs} onChange={(e) => setRuns(Number(e.target.value))} data-testid="input-simulation-runs" style={{ width: '100%', margin: '7px 0 15px' }} /><button className="button button-primary" data-testid="button-run-simulation" disabled={mutation.isPending || !brandId}><Zap size={14} />{mutation.isPending ? 'Running model…' : 'Run simulation'}</button></form>{mutation.error && <div className="error-state">Simulation could not be completed. Adjust the run size and retry.</div>}{mutation.isSuccess && <div className="event-callout" data-testid="status-simulation-complete" style={{ marginTop: 13 }}>Scenario results are ready for review.</div>}</Panel>
      <Panel title="How to read this" note="Scenario comparison, not a prediction"><p style={{ color: '#677570', fontSize: 13, lineHeight: 1.8 }}>This experiment compares modeled information spread across the scenarios returned by ReputeLens. Use the relative reach and trajectory to pressure-test a response plan; validate assumptions with your communications team.</p><div className="section-label">Model parameters</div><p className="mini-stat">{steps} steps <span className="text-muted">·</span> {runs} runs</p></Panel></div>
    {result && <Panel title="Projected reach by scenario" note="Expected reach · indexed simulation horizon"><div style={{ display: 'grid', gap: 20 }}>{result.series.map((line, i) => <div key={line.scenario} data-testid={`scenario-result-${i}`}><div className="list-row"><strong>{line.scenario}</strong><span className="mini-stat">{formatNum(line.expected_reach)} expected reach</span></div><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(3, (line.expected_reach / max) * 100)}%`, background: ['#1d7564','#d2a34d','#648897'][i % 3] }} /></div><div className="legend">{line.steps.map((point, index) => <span key={`${index}-${point}`}>Step {index + 1}: {formatNum(point)}</span>)}</div></div>)}</div></Panel>}
  </Page>;
}

function CompetitorsPage() {
  const data = useGetCompetitorBenchmark();
  const { brandId } = useBrand();
  const suspicious = useGetMentions({ brand_id: brandId, page: 1, page_size: 20, sort: 'priority' });
  const flagged = suspicious.data?.items.filter((m) => m.suspicious) ?? [];
  const max = Math.max(1, ...(data.data?.map((d) => d.share_of_voice) ?? [1]));
  return <Page title="The category, side by side" subtitle="Understand relative reputation, voice share, and suspicious review patterns." eyebrow="COMPETITIVE INTELLIGENCE">
    <LoadState loading={data.isLoading} error={data.error} empty={!data.data?.length} retry={apiRetry(data)}><div className="two-col"><Panel title="Share of voice" note="Tracked mentions across brands">{data.data?.map((metric) => <div className="list-row" key={metric.brand_id} data-testid={`competitor-share-${metric.brand_id}`}><span style={{ width: 130, fontWeight: 600 }}>{metric.name}</span><div className="bar-track" style={{ flex: 1 }}><div className="bar-fill" style={{ width: `${metric.share_of_voice / max * 100}%`, background: metric.color }} /></div><span className="mini-stat" style={{ width: 46, textAlign: 'right' }}>{metric.share_of_voice}%</span></div>)}</Panel><Panel title="Suspicious review watch" note="Flagged mentions surfaced by the analysis"><Metric label="Flagged mentions" value={flagged.length} icon={AlertTriangle} tone="down" />{flagged.slice(0, 4).map((m) => <div className="list-row" key={m.id} data-testid={`suspicious-review-${m.id}`}><div><strong>{m.author}</strong><div className="text-muted" style={{ fontSize: 10, marginTop: 3 }}>{m.text}</div></div><span className="tag red">Review</span></div>)}{!flagged.length && <div className="empty-state">No suspicious reviews detected in the current sample.</div>}</Panel></div><Panel title="Competitive benchmark" note="Brand health and conversation quality"><div className="table-wrap"><table className="data-table"><thead><tr><th>Brand</th><th>Volume</th><th>Net sentiment</th><th>Share of voice</th><th>Health</th><th>Suspicious reviews</th></tr></thead><tbody>{data.data?.map((m) => <tr key={m.brand_id} data-testid={`row-competitor-${m.brand_id}`}><td><strong style={{ color: m.color }}>●</strong> &nbsp;{m.name}</td><td>{formatNum(m.volume)}</td><td>{m.net_sentiment}</td><td>{m.share_of_voice}%</td><td>{m.health_score}</td><td>{m.suspicious_reviews}</td></tr>)}</tbody></table></div></Panel></LoadState>
  </Page>;
}

function ResponsesPage() {
  const { brandId } = useBrand();
  const actions = useGetResponseActions({ brand_id: brandId });
  const create = useCreateResponseAction();
  const qc = useQueryClient();
  const [actionType, setActionType] = useState<'public_statement' | 'reply' | 'influencer_outreach' | 'product_fix' | 'other'>('public_statement');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const submit = (e: FormEvent) => { e.preventDefault(); if (!brandId || description.trim().length < 3) return; create.mutate({ data: { brand_id: brandId, action_type: actionType, description: description.trim(), responded_at: new Date(date).toISOString() } }, { onSuccess: () => { setDescription(''); void qc.invalidateQueries({ queryKey: getGetResponseActionsQueryKey({ brand_id: brandId }) }); void qc.invalidateQueries({ queryKey: getGetOverviewQueryKey({ brand_id: brandId, days: 30 }) }); } }); };
  return <Page title="Response actions & impact" subtitle="Record what the team did, then measure what changed in the conversation." eyebrow="ACTION LEDGER" action={<span className="tag">Impact measured against observed signals</span>}>
    <div className="two-col"><Panel title="Log a response" note="Add a response action to the measured record"><form onSubmit={submit} style={{ display: 'grid', gap: 12 }}><label className="section-label">Action type</label><select className="select" data-testid="select-response-type" value={actionType} onChange={(e) => setActionType(e.target.value as typeof actionType)}><option value="public_statement">Public statement</option><option value="reply">Direct reply</option><option value="influencer_outreach">Influencer outreach</option><option value="product_fix">Product fix</option><option value="other">Other</option></select><label className="section-label">What did the team do?</label><textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} minLength={3} placeholder="Describe the response and its intended audience…" data-testid="input-response-description" /><label className="section-label">Response date</label><input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-response-date" /><button className="button button-primary" disabled={create.isPending || !brandId} data-testid="button-save-response"><Plus size={14} />{create.isPending ? 'Saving…' : 'Record response'}</button></form>{create.isSuccess && <div className="event-callout" data-testid="status-response-created" style={{ marginTop: 12 }}>Response recorded. The ledger is up to date.</div>}{create.error && <div className="error-state">Could not record response. Please retry.</div>}</Panel>
      <Panel title="Impact snapshot" note="Measured before and after each recorded intervention"><LoadState loading={actions.isLoading} error={actions.error} empty={!actions.data?.length} retry={apiRetry(actions)}>{actions.data?.slice(0, 4).map((a) => <div className="list-row" key={a.id} data-testid={`response-impact-${a.id}`}><div><strong style={{ fontSize: 12 }}>{a.action_type.replaceAll('_', ' ')}</strong><div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>{new Date(a.responded_at).toLocaleDateString()}</div></div><span className="tag">{a.verdict}</span></div>)}</LoadState></Panel></div>
    <Panel title="Response history" note={`${actions.data?.length ?? 0} actions in this record`}><LoadState loading={actions.isLoading} error={actions.error} empty={!actions.data?.length} retry={apiRetry(actions)}><div className="table-wrap"><table className="data-table"><thead><tr><th>Action</th><th>When</th><th>Sentiment before → after</th><th>Negative mentions / day</th><th>Measured read</th></tr></thead><tbody>{actions.data?.map((a) => <tr key={a.id} data-testid={`row-response-${a.id}`}><td><strong>{a.action_type.replaceAll('_', ' ')}</strong><div className="text-muted">{a.description}</div></td><td>{new Date(a.responded_at).toLocaleDateString()}</td><td>{a.before_sentiment} → <strong>{a.after_sentiment}</strong></td><td>{a.before_negative_per_day} → <strong>{a.after_negative_per_day}</strong></td><td><span className="tag">{a.verdict}</span></td></tr>)}</tbody></table></div></LoadState></Panel>
  </Page>;
}

function AskPage() {
  const { brandId } = useBrand();
  const ask = useAskReputeLens();
  const [question, setQuestion] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const run = (value: string) => { if (!brandId || value.trim().length < 2) return; setLastQuestion(value); ask.mutate({ data: { question: value.trim(), brand_id: brandId } }); };
  return <Page title="Ask the evidence" subtitle="A cited answer across your tracked conversation. Every conclusion points back to the source." eyebrow="REPUTELENS ASSISTANT">
    <div className="two-col"><section className="panel panel-pad" style={{ gridColumn: '1 / -1' }}><div className="panel-head"><div><h2 className="panel-title">What would you like to understand?</h2><div className="panel-note">Ask about sentiment shifts, audience concerns, or the drivers behind a topic.</div></div><Sparkles size={17} color="#c19b4f" /></div><form onSubmit={(e) => { e.preventDefault(); run(question); }}><textarea className="textarea" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What is driving the change in customer sentiment this month?" data-testid="input-ask-question" /><div className="head-actions" style={{ justifyContent: 'space-between', marginTop: 10 }}><div className="legend"><span>Try:</span><button type="button" className="button" data-testid="button-suggested-question" onClick={() => { setQuestion('What are the main drivers of negative sentiment?'); }}>Negative sentiment drivers</button><button type="button" className="button" data-testid="button-suggested-question-risk" onClick={() => setQuestion('Which emerging narrative needs attention first?')}>Emerging risk</button></div><button className="button button-primary" data-testid="button-ask-submit" disabled={ask.isPending || question.trim().length < 2 || !brandId}><Search size={14} />{ask.isPending ? 'Searching evidence…' : 'Ask ReputeLens'}</button></div></form></section></div>
    {ask.error && <div className="error-state panel" role="alert">We couldn’t produce an answer from the available evidence. <button className="button" data-testid="button-retry-ask" onClick={() => run(lastQuestion)}>Retry</button></div>}
    {ask.data && <div className="two-col" data-testid="ask-answer"><Panel title="Evidence-backed answer" note={`Asked: ${lastQuestion} · Provider: ${ask.data.provider}`}><div className="prose" style={{ fontSize: 13, color: '#53645f', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{ask.data.answer_markdown}</div>{ask.data.facts_used.length > 0 && <><div className="splitline" /><div className="section-label">Facts used</div>{ask.data.facts_used.map((fact, i) => <div className="list-row" key={fact} data-testid={`fact-used-${i}`}><span>{fact}</span><Check size={14} color="#39836f" /></div>)}</>}</Panel><Panel title="Source mentions" note={`${ask.data.citations.length} citations from tracked conversation`}>{ask.data.citations.map((citation) => <div className="event-callout" key={citation.id} data-testid={`citation-${citation.id}`} style={{ marginBottom: 9 }}>{citation.text}<div className="text-muted" style={{ marginTop: 6 }}>— {citation.author} · {citation.source} · {new Date(citation.created_at).toLocaleDateString()}</div></div>)}{ask.data.suggested_followups.length > 0 && <><div className="section-label">Follow-up questions</div>{ask.data.suggested_followups.map((followup) => <button className="button" key={followup} data-testid={`button-followup-${ask.data!.suggested_followups.indexOf(followup)}`} onClick={() => { setQuestion(followup); run(followup); }} style={{ margin: '8px 6px 0 0' }}>{followup}</button>)}</>}</Panel></div>}
  </Page>;
}

function ReportsPage() {
  const { brandId } = useBrand();
  const overview = useGetOverview({ brand_id: brandId, days: 30 });
  const alerts = useGetAlerts({ brand_id: brandId, status: 'open' });
  const topics = useGetTopics({ brand_id: brandId });
  const series = useGetSentimentTimeseries({ brand_id: brandId, days: 30 });
  const [status, setStatus] = useState('');
  return <Page title="Executive brief" subtitle="A concise operating read for the people accountable for reputation." eyebrow="WEEKLY READOUT" action={<button className="button" data-testid="button-export-brief" onClick={() => setStatus('Brief prepared for print. Use your browser’s print dialog to save as PDF.')}><FileText size={14} /> Prepare brief</button>}>
    {(overview.isLoading || alerts.isLoading || topics.isLoading || series.isLoading) ? <LoadState loading error={null} empty={false}>{null}</LoadState> : overview.error || alerts.error || topics.error ? <LoadState loading={false} error={overview.error || alerts.error || topics.error} empty={false} retry={apiRetry(overview)}>{null}</LoadState> : <>
      <div className="metric-grid"><Metric label="Health score" value={overview.data?.health.score ?? '—'} delta={`${overview.data?.health.delta ?? 0} pts`} icon={ShieldCheck} /><Metric label="Risk band" value={overview.data?.crisis.band ?? '—'} delta={`Exposure ${overview.data?.crisis.risk ?? '—'}`} icon={AlertTriangle} tone="down" /><Metric label="Mentions" value={formatNum(overview.data?.kpis.mentions?.value)} delta={`${overview.data?.period.days ?? 30} day window`} icon={MessageCircle} /><Metric label="Open alerts" value={alerts.data?.length ?? 0} icon={Bell} /></div>
      <div className="two-col"><Panel title="Conversation trajectory" note="Daily mention volume"><SentimentChart points={series.data ?? []} /></Panel><Panel title="What leaders should know" note="Emerging topics with the clearest momentum">{topics.data?.filter((t) => t.is_emerging).slice(0, 5).map((t) => <div className="list-row" key={t.id} data-testid={`brief-topic-${t.id}`}><div><strong>{t.label}</strong><div className="text-muted">{t.negative_share}% negative · {formatNum(t.mention_count)} mentions</div></div><span className="tag gold">+{t.growth_rate}%</span></div>)}</Panel></div>
      <Panel title="Watch list" note="Active risk requiring leadership awareness">{alerts.data?.length ? alerts.data.map((a) => <div className="list-row" key={a.id} data-testid={`brief-alert-${a.id}`}><div><strong>{a.title}</strong><div className="text-muted">{a.description}</div></div><span className={`tag ${a.severity === 'high' || a.severity === 'critical' ? 'red' : 'gold'}`}>{a.severity}</span></div>) : <div className="empty-state">No open alerts for this period.</div>}</Panel>
    </>}
    {status && <div className="event-callout" data-testid="status-brief-export" style={{ marginTop: 13 }}>{status}</div>}
  </Page>;
}

function GeographyPage() {
  const { brandId } = useBrand();
  const geo = useGetGeography({ brand_id: brandId });
  const sorted = geo.data?.slice().sort((a, b) => b.volume - a.volume) ?? [];
  const max = Math.max(1, ...sorted.map((city) => city.volume));
  return <Page title="Where the story is happening" subtitle="City-level shifts help local teams respond with context, not guesswork." eyebrow="GEOGRAPHIC SIGNALS">
    <LoadState loading={geo.isLoading} error={geo.error} empty={!sorted.length} retry={apiRetry(geo)}>
      <div className="two-col"><Panel title="City signal map" note="Relative mention volume by city"><div className="topic-cloud" style={{ minHeight: 260 }}>{sorted.slice(0, 16).map((city, i) => <div key={city.city} data-testid={`city-point-${i}`} style={{ width: `${Math.max(95, 100 + city.volume / max * 100)}px`, padding: `${8 + city.volume / max * 8}px 10px`, background: city.net_sentiment < 0 ? '#f6e7e1' : '#e6f0e8', borderRadius: 8, textAlign: 'center', border: '1px solid #e5e4d8' }}><strong style={{ fontSize: 12 }}>{city.city}</strong><div className="text-muted" style={{ fontSize: 10 }}>{formatNum(city.volume)} mentions</div></div>)}</div></Panel><Panel title="Cities to watch" note="Sorted by mention volume">{sorted.slice(0, 7).map((city) => <div className="list-row" key={city.city} data-testid={`city-watch-${city.city}`}><div><strong style={{ fontSize: 12 }}>{city.city}</strong><div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>Negative driver: {city.top_negative_aspect}</div></div><span className={`tag ${city.delta_pct < 0 ? 'red' : 'gold'}`}>{city.delta_pct > 0 ? '+' : ''}{city.delta_pct}%</span></div>)}</Panel></div>
      <Panel title="City metrics" note="The signals behind local conversation"><div className="table-wrap"><table className="data-table"><thead><tr><th>City</th><th>Mentions</th><th>Net sentiment</th><th>Top negative aspect</th><th>Change</th></tr></thead><tbody>{sorted.map((city, i) => <tr key={city.city} data-testid={`row-city-${i}`}><td><strong>{city.city}</strong></td><td>{formatNum(city.volume)}</td><td>{city.net_sentiment}</td><td>{city.top_negative_aspect}</td><td>{city.delta_pct > 0 ? '+' : ''}{city.delta_pct}%</td></tr>)}</tbody></table></div></Panel>
    </LoadState>
  </Page>;
}

function EvaluationPage() {
  const evaluation = useGetModelEvaluation();
  return <Page title="Model evaluation" subtitle="Offline performance, held out from the stream. Confidence starts with measurement." eyebrow="QUALITY & CALIBRATION">
    <LoadState loading={evaluation.isLoading} error={evaluation.error} empty={!evaluation.data?.models.length} retry={apiRetry(evaluation)}>
      <div className="metric-grid"><Metric label="Labeled examples" value={formatNum(evaluation.data?.labeled_count)} icon={FileText} /><Metric label="Sarcasm accuracy" value={`${evaluation.data?.sarcasm_accuracy ?? '—'}%`} icon={Target} /><Metric label="Hinglish accuracy" value={`${evaluation.data?.hinglish_accuracy ?? '—'}%`} icon={MessageCircle} /><Metric label="Models evaluated" value={evaluation.data?.models.length ?? 0} icon={Bot} /></div>
      <Panel title="Performance by model" note="Offline evaluation metrics"><div className="table-wrap"><table className="data-table"><thead><tr><th>Model</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>{evaluation.data?.models.map((model, i) => <tr key={model.model} data-testid={`row-model-${i}`}><td><strong>{model.model}</strong></td><td>{model.accuracy}%</td><td>{model.precision}%</td><td>{model.recall}%</td><td><span className="tag">{model.f1}</span></td></tr>)}</tbody></table></div></Panel>
      <div className="event-callout" style={{ marginTop: 14 }}><ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />Offline metrics are a quality signal, not a substitute for review of high-impact response decisions.</div>
    </LoadState>
  </Page>;
}

function SettingsPage() {
  const settings = useGetSettings();
  const brands = useGetBrands();
  const update = useUpdateSettings();
  const qc = useQueryClient();
  const [spike, setSpike] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [keywords, setKeywords] = useState<string | null>(null);
  const s = settings.data;
  const save = () => { if (!s) return; update.mutate({ data: { negative_spike_z: spike ?? s.negative_spike_z, risk_keyword_threshold: threshold ?? s.risk_keyword_threshold, risk_keywords: (keywords ?? s.risk_keywords.join(', ')).split(',').map((x) => x.trim()).filter(Boolean) } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() }); } }); };
  return <Page title="Settings & sources" subtitle="Tune alert sensitivity and see which data connectors are configured." eyebrow="WORKSPACE CONFIGURATION">
    <LoadState loading={settings.isLoading || brands.isLoading} error={settings.error || brands.error} empty={!s} retry={apiRetry(settings)}>
      <div className="two-col"><Panel title="Alert thresholds" note="Applied to new signal detection"><div style={{ display: 'grid', gap: 14 }}><label className="section-label">Negative spike sensitivity (z-score)</label><input className="field" type="number" step=".1" min="1" max="10" value={spike ?? s?.negative_spike_z ?? 1} onChange={(e) => setSpike(Number(e.target.value))} data-testid="input-negative-spike-threshold" /><label className="section-label">Risk keyword threshold</label><input className="field" type="number" min="1" max="100" value={threshold ?? s?.risk_keyword_threshold ?? 1} onChange={(e) => setThreshold(Number(e.target.value))} data-testid="input-risk-keyword-threshold" /><label className="section-label">Risk keywords · comma separated</label><textarea className="textarea" value={keywords ?? s?.risk_keywords.join(', ') ?? ''} onChange={(e) => setKeywords(e.target.value)} data-testid="input-risk-keywords" /><button className="button button-primary" data-testid="button-save-settings" disabled={update.isPending} onClick={save}><Check size={14} />{update.isPending ? 'Saving…' : 'Save thresholds'}</button>{update.isSuccess && <div className="event-callout" data-testid="status-settings-saved">Settings saved and active.</div>}{update.error && <div className="error-state">Settings were not saved. Check the values and retry.</div>}</div></Panel>
      <Panel title="Data connectors" note="Current connection state from the workspace"><div style={{ display: 'grid', gap: 12 }}>{s?.connectors.map((connector, i) => <div className="list-row" key={connector.name} data-testid={`connector-${i}`}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="brand-icon" style={{ width: 29, height: 29, borderRadius: 8, background: '#e5eee8', color: '#2e725e' }}><Activity size={15} /></span><div><strong style={{ fontSize: 12 }}>{connector.name}</strong><div className="text-muted" style={{ fontSize: 10, marginTop: 3 }}>{connector.detail}</div></div></div><span className={`tag ${connector.configured ? '' : 'gray'}`}>{connector.configured ? 'Connected' : 'Not configured'}</span></div>)}</div></Panel></div>
      <Panel title="Tracked brands" note="Brands currently included in the monitoring workspace">{brands.data?.map((brand) => <div className="list-row" key={brand.id} data-testid={`settings-brand-${brand.id}`}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: brand.color }} /><strong>{brand.name}</strong></div><span className={`tag ${brand.is_primary ? '' : 'gray'}`}>{brand.is_primary ? 'Primary brand' : 'Tracked'}</span></div>)}</Panel>
    </LoadState>
  </Page>;
}

function StatusCorner() {
  const health = useHealthCheck();
  return <div style={{ display: 'none' }} aria-hidden="true" data-testid="service-health-status">{health.data?.status ?? 'checking'}</div>;
}
function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><AppShell><StatusCorner /><Switch>
    <Route path="/" component={OverviewPage} /><Route path="/sentiment" component={SentimentPage} />
    <Route path="/narratives" component={NarrativesPage} /><Route path="/network" component={NetworkPage} />
    <Route path="/crisis" component={CrisisPage} /><Route path="/simulate" component={SimulatePage} />
    <Route path="/competitors" component={CompetitorsPage} /><Route path="/responses" component={ResponsesPage} />
    <Route path="/ask" component={AskPage} /><Route path="/reports" component={ReportsPage} />
    <Route path="/geography" component={GeographyPage} /><Route path="/evaluation" component={EvaluationPage} />
    <Route path="/settings" component={SettingsPage} /><Route component={NotFound} />
  </Switch></AppShell></ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
