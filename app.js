// NEXUS read-only frontend.
// Talks only to existing GET endpoints: /api/health and /api/agent/feed.
// Never calls /api/agent/init or /api/agent/tick — this UI must not mutate agent state.

const POLL_INTERVAL_MS = 30000;

const el = {
  statusPill: document.getElementById('status-pill'),
  statusPillLabel: document.getElementById('status-pill-label'),
  pulseDot: document.getElementById('pulse-dot'),
  telScheduler: document.getElementById('tel-scheduler'),
  telLlm: document.getElementById('tel-llm'),
  telMemory: document.getElementById('tel-memory'),
  telLastRun: document.getElementById('tel-lastrun'),
  telAgentId: document.getElementById('tel-agentid'),
  traceLine: document.getElementById('trace-line'),
  feedState: document.getElementById('feed-state'),
  feedList: document.getElementById('feed-list'),
  refreshBtn: document.getElementById('refresh-btn'),
};

let cachedAgentId = null;

function setStatusPill(mode, label) {
  el.statusPill.classList.remove('live', 'down');
  if (mode) el.statusPill.classList.add(mode);
  el.statusPillLabel.textContent = label;
}

function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatAbsoluteTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Draws a deterministic "signal trace" polyline seeded from tick metrics.
// This is a genuine (if simplified) visualization: it maps discovered / accepted / rejected
// counts from the most recent cycle into waveform amplitude — not decoration.
function drawTrace(metrics) {
  const width = 1000;
  const height = 120;
  const mid = 60;
  const points = [];
  const segments = 60;

  const discovered = metrics?.discoveredCount ?? 0;
  const accepted = metrics?.acceptedCount ?? 0;
  const rejected = metrics?.rejectedCount ?? 0;
  const total = Math.max(discovered, 1);

  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * width;
    const t = i / segments;
    let amplitude = 6 * Math.sin(t * Math.PI * 2 * 3);

    // Spike proportional to accepted signal roughly a third of the way through,
    // dip proportional to rejected hype two-thirds through.
    const acceptPos = 0.32;
    const rejectPos = 0.68;
    const acceptSpike = (accepted / total) * 42 * Math.exp(-Math.pow((t - acceptPos) * 10, 2));
    const rejectDip = (rejected / total) * 28 * Math.exp(-Math.pow((t - rejectPos) * 10, 2));

    const y = mid - amplitude - acceptSpike + rejectDip;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  el.traceLine.setAttribute('points', points.join(' '));
}

function renderTelemetry(health) {
  const schedulerOn = !!health.schedulerActive;
  el.telScheduler.textContent = schedulerOn ? 'Active' : 'Idle';
  el.telLlm.textContent = health.llmProvider || '—';
  el.telMemory.textContent = health.memoryProvider || '—';
  el.telLastRun.textContent = health.lastRunAt
    ? `${formatRelativeTime(health.lastRunAt)}`
    : 'No cycles yet';
  el.telAgentId.textContent = health.agentId || 'Not initialized';

  if (health.initialized && schedulerOn) {
    setStatusPill('live', 'Autonomous · Live');
    el.pulseDot.style.background = '';
  } else if (health.initialized) {
    setStatusPill(null, 'Initialized · Idle');
  } else {
    setStatusPill('down', 'Not initialized');
  }

  drawTrace(health.lastTickMetrics);
}

function sourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function renderPost(post) {
  const li = document.createElement('li');
  li.className = 'post-card';

  const meta = document.createElement('div');
  meta.className = 'post-meta';
  const idSpan = document.createElement('span');
  idSpan.className = 'post-id';
  idSpan.textContent = post.id;
  const timeSpan = document.createElement('span');
  timeSpan.title = post.createdAt || '';
  timeSpan.textContent = post.createdAt
    ? `${formatAbsoluteTime(post.createdAt)} · ${formatRelativeTime(post.createdAt)}`
    : '';
  meta.append(idSpan, timeSpan);

  const text = document.createElement('p');
  text.className = 'post-text';
  text.textContent = post.text || '';

  li.append(meta, text);

  if (post.rationale) {
    const rationale = document.createElement('div');
    rationale.className = 'rationale';
    const label = document.createElement('div');
    label.className = 'rationale-label';
    label.textContent = 'Editorial rationale';
    const body = document.createElement('div');
    body.className = 'rationale-body';
    body.textContent = post.rationale;
    rationale.append(label, body);
    li.appendChild(rationale);
  }

  if (Array.isArray(post.sources) && post.sources.length) {
    const sources = document.createElement('div');
    sources.className = 'sources';
    post.sources.forEach((url) => {
      const a = document.createElement('a');
      a.className = 'source-chip';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = sourceHost(url);
      sources.appendChild(a);
    });
    li.appendChild(sources);
  }

  return li;
}

function renderFeed(posts) {
  el.feedList.innerHTML = '';

  if (!posts || posts.length === 0) {
    el.feedState.hidden = false;
    el.feedList.hidden = true;
    el.feedState.innerHTML = '<div class="empty-state">No posts published yet. NEXUS publishes autonomously once its editorial judge accepts a topic — check back after the next cycle.</div>';
    return;
  }

  el.feedState.hidden = true;
  el.feedList.hidden = false;
  posts.forEach((post) => el.feedList.appendChild(renderPost(post)));
}

function showFeedError(message) {
  el.feedState.hidden = false;
  el.feedList.hidden = true;
  el.feedState.innerHTML = `<div class="empty-state error">${message}</div>`;
}

async function fetchHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json();
}

async function fetchFeed(agentId) {
  const res = await fetch(`/api/agent/feed?agentId=${encodeURIComponent(agentId)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Feed request failed (${res.status})`);
  }
  return res.json();
}

async function refresh({ isManual = false } = {}) {
  if (isManual) el.refreshBtn.classList.add('spinning');

  try {
    const health = await fetchHealth();
    renderTelemetry(health);

    if (!health.initialized || !health.agentId) {
      showFeedError('NEXUS has not been initialized yet. Call POST /api/agent/init once to start the autonomous scheduler.');
      return;
    }

    cachedAgentId = health.agentId;
    const feed = await fetchFeed(cachedAgentId);
    renderFeed(feed.posts);
  } catch (err) {
    setStatusPill('down', 'Unreachable');
    showFeedError(`Could not reach NEXUS: ${err.message}`);
  } finally {
    if (isManual) {
      setTimeout(() => el.refreshBtn.classList.remove('spinning'), 400);
    }
  }
}

el.refreshBtn.addEventListener('click', () => refresh({ isManual: true }));

refresh();
setInterval(refresh, POLL_INTERVAL_MS);
