/**
 * Bluesky Feed Card for Home Assistant
 * Displays a Bluesky social feed timeline in a Lovelace dashboard.
 */

const CARD_VERSION = '1.0.0';
const BLUESKY_BLUE = '#1185fe';

const ICON_REPLY = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

const ICON_REPOST = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;

const ICON_LIKE = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

const ICON_REPOST_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;

const ICON_REPLY_INDICATOR = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M15.793 10.293a1 1 0 0 1 1.338-.068l.076.068 3.293 3.293a2 2 0 0 1 .138 2.677l-.138.151-3.293 3.293a1 1 0 1 1-1.414-1.414L18.086 16H8a5 5 0 0 1-5-5V5a1 1 0 0 1 2 0v6a3 3 0 0 0 3 3h10.086l-2.293-2.293-.068-.076a1 1 0 0 1 .068-1.338Z"/></svg>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}

function timeAgo(isoString) {
  if (!isoString) return '';
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const d = new Date(isoString);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatCount(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function sanitizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch { /* invalid URL */ }
  return '';
}

function postUrl(handle, uri) {
  if (!handle || !uri) return '#';
  const parts = uri.split('/');
  const rkey = parts[parts.length - 1];
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

function renderTextWithFacets(text, facets) {
  if (!text) return '';
  if (!facets || facets.length === 0) return escapeHtml(text);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(text);
  const sorted = [...facets].sort(
    (a, b) => (a.index?.byteStart ?? 0) - (b.index?.byteStart ?? 0)
  );

  let result = '';
  let lastEnd = 0;

  for (const facet of sorted) {
    const start = facet.index?.byteStart ?? 0;
    const end = facet.index?.byteEnd ?? 0;
    if (start < lastEnd || end <= start || end > bytes.length) continue;

    result += escapeHtml(decoder.decode(bytes.slice(lastEnd, start)));
    const facetText = escapeHtml(decoder.decode(bytes.slice(start, end)));
    const feature = (facet.features || [])[0];

    if (!feature) {
      result += facetText;
    } else if (feature.$type === 'app.bsky.richtext.facet#link') {
      const safeUri = sanitizeUrl(feature.uri || '');
      if (safeUri) {
        result += `<a href="${escapeHtml(safeUri)}" target="_blank" rel="noopener" class="post-link">${facetText}</a>`;
      } else {
        result += facetText;
      }
    } else if (feature.$type === 'app.bsky.richtext.facet#mention') {
      result += `<a href="https://bsky.app/profile/${escapeHtml(feature.did || '')}" target="_blank" rel="noopener" class="post-mention">${facetText}</a>`;
    } else if (feature.$type === 'app.bsky.richtext.facet#tag') {
      result += `<a href="https://bsky.app/hashtag/${escapeHtml(feature.tag || '')}" target="_blank" rel="noopener" class="post-tag">${facetText}</a>`;
    } else {
      result += facetText;
    }
    lastEnd = end;
  }

  if (lastEnd < bytes.length) {
    result += escapeHtml(decoder.decode(bytes.slice(lastEnd)));
  }
  return result;
}

function defaultAvatar(name) {
  const letter = ([...(name || '?')][0] || '?').toUpperCase();
  try {
    return `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="${BLUESKY_BLUE}"/><text x="50" y="54" font-size="42" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif">${letter}</text></svg>`
    )}`;
  } catch {
    return `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="${BLUESKY_BLUE}"/><text x="50" y="54" font-size="42" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif">?</text></svg>`
    )}`;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CARD_STYLES = `
  :host {
    --bsky-blue: ${BLUESKY_BLUE};
    --bsky-like: #ec4899;
    --bsky-repost: #22c55e;
  }
  ha-card {
    overflow: hidden;
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--divider-color, rgba(0,0,0,.12));
  }
  .card-header ha-icon {
    flex-shrink: 0;
    --mdc-icon-size: 24px;
    color: var(--bsky-blue);
  }
  .header-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--primary-text-color, #1d1d1f);
    letter-spacing: 0.01em;
  }
  .feed-container {
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--divider-color, rgba(0,0,0,.12)) transparent;
  }
  ha-card > .feed-container:first-child {
    border-top: none;
  }
  .feed-container::-webkit-scrollbar {
    width: 4px;
  }
  .feed-container::-webkit-scrollbar-thumb {
    background: var(--divider-color, rgba(0,0,0,.12));
    border-radius: 4px;
  }

  /* --- Post --- */
  .post-wrapper {
    border-bottom: 1px solid var(--divider-color, rgba(0,0,0,.12));
  }
  .post-wrapper:last-child {
    border-bottom: none;
  }
  .repost-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px 0 68px;
    font-size: 12px;
    font-weight: 500;
    color: var(--secondary-text-color, #65676b);
  }
  .repost-indicator svg {
    color: var(--bsky-repost);
  }
  .reply-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px 0 68px;
    font-size: 12px;
    font-weight: 500;
    color: var(--secondary-text-color, #65676b);
  }
  .reply-indicator svg {
    color: var(--secondary-text-color, #65676b);
  }
  .post {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  .post:hover {
    background: var(--secondary-background-color, rgba(0,0,0,.03));
  }
  .avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--divider-color, rgba(0,0,0,.06));
  }
  .post-content {
    flex: 1;
    min-width: 0;
  }
  .post-header {
    display: flex;
    align-items: baseline;
    gap: 4px;
    flex-wrap: wrap;
    line-height: 1.3;
  }
  .display-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--primary-text-color, #1d1d1f);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 45%;
  }
  .handle {
    font-size: 13px;
    color: var(--secondary-text-color, #65676b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 35%;
  }
  .separator {
    color: var(--secondary-text-color, #65676b);
    font-size: 13px;
    flex-shrink: 0;
  }
  .timestamp {
    font-size: 13px;
    color: var(--secondary-text-color, #65676b);
    flex-shrink: 0;
    margin-left: auto;
  }
  .post-text {
    margin-top: 4px;
    font-size: 14px;
    line-height: 1.45;
    color: var(--primary-text-color, #1d1d1f);
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .post-link, .post-mention, .post-tag {
    color: var(--bsky-blue);
    text-decoration: none;
  }
  .post-link:hover, .post-mention:hover, .post-tag:hover {
    text-decoration: underline;
  }

  /* --- Images --- */
  .post-images {
    display: grid;
    gap: 4px;
    margin-top: 10px;
    border-radius: 10px;
    overflow: hidden;
  }
  .post-images.count-1 {
    grid-template-columns: 1fr;
  }
  .post-images.count-2 {
    grid-template-columns: 1fr 1fr;
  }
  .post-images.count-3 {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .post-images.count-3 .post-image:first-child {
    grid-row: 1 / 3;
  }
  .post-images.count-4 {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .post-image {
    width: 100%;
    height: 100%;
    min-height: 80px;
    max-height: 240px;
    object-fit: cover;
    cursor: pointer;
    transition: opacity 0.15s ease;
    background: var(--divider-color, rgba(0,0,0,.06));
  }
  .post-image:hover {
    opacity: 0.9;
  }

  /* --- External link card --- */
  .external-card {
    display: flex;
    margin-top: 10px;
    border: 1px solid var(--divider-color, rgba(0,0,0,.12));
    border-radius: 10px;
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition: background-color 0.15s ease;
  }
  .external-card:hover {
    background: var(--secondary-background-color, rgba(0,0,0,.03));
  }
  .external-thumb {
    width: 120px;
    min-height: 80px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--divider-color, rgba(0,0,0,.06));
  }
  .external-info {
    padding: 10px 12px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }
  .external-domain {
    font-size: 11px;
    color: var(--secondary-text-color, #65676b);
    text-transform: lowercase;
  }
  .external-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-text-color, #1d1d1f);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.3;
  }
  .external-desc {
    font-size: 12px;
    color: var(--secondary-text-color, #65676b);
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.3;
  }

  /* --- Quote post --- */
  .quote-post {
    margin-top: 10px;
    border: 1px solid var(--divider-color, rgba(0,0,0,.12));
    border-radius: 10px;
    padding: 10px 12px;
  }
  .quote-header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }
  .quote-avatar {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .quote-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex-shrink: 1;
  }
  .quote-handle {
    font-size: 12px;
    color: var(--secondary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex-shrink: 1;
  }
  .quote-text {
    margin-top: 4px;
    font-size: 13px;
    line-height: 1.35;
    color: var(--primary-text-color);
    white-space: pre-wrap;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* --- Metrics --- */
  .metrics {
    display: flex;
    gap: 20px;
    margin-top: 10px;
  }
  .metric {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    color: var(--secondary-text-color, #65676b);
    transition: color 0.15s ease;
  }
  .metric.reply:hover { color: var(--bsky-blue); }
  .metric.repost:hover { color: var(--bsky-repost); }
  .metric.like:hover { color: var(--bsky-like); }
  .metric svg { vertical-align: middle; }
  .metric.like, .metric.repost {
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
  }
  .metric.like.active {
    color: var(--bsky-like);
  }
  .metric.like.active svg {
    fill: currentColor;
  }
  .metric.repost.active {
    color: var(--bsky-repost);
  }
  .metric.loading {
    opacity: 0.5;
    pointer-events: none;
  }

  /* --- States --- */
  .empty-state, .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
    color: var(--secondary-text-color, #65676b);
    gap: 8px;
  }
  .empty-state ha-icon { opacity: 0.4; }
  .empty-state-text {
    font-size: 14px;
  }
  .error-state-text {
    font-size: 14px;
    color: var(--error-color, #db4437);
  }

  /* --- Lightbox --- */
  .lightbox {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.88);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    cursor: pointer;
    animation: fadeIn 0.2s ease;
    padding: 20px;
    box-sizing: border-box;
  }
  .lightbox img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 8px;
    cursor: default;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

// ---------------------------------------------------------------------------
// Card Editor
// ---------------------------------------------------------------------------

const EDITOR_SCHEMA = [
  {
    name: 'entity',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'title',
    selector: { text: {} },
  },
  {
    name: 'icon',
    selector: { icon: {} },
  },
  {
    name: 'max_posts',
    selector: { number: { min: 1, max: 50, mode: 'box' } },
  },
  {
    name: 'max_height',
    selector: { text: {} },
  },
  {
    name: 'show_images',
    selector: { boolean: {} },
  },
  {
    name: 'show_metrics',
    selector: { boolean: {} },
  },
  {
    name: 'repost_action',
    selector: {
      select: {
        options: [
          { value: 'repost', label: 'Repost directly' },
          { value: 'quote', label: 'Open quote compose' },
        ],
        mode: 'dropdown',
      },
    },
  },
];

class BlueskyFeedCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._form = null;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _render() {
    const root = this.shadowRoot;

    if (!this._form) {
      root.innerHTML = '';
      const form = document.createElement('ha-form');
      form.schema = EDITOR_SCHEMA;
      form.computeLabel = (schema) => {
        const labels = {
          entity: 'Entity',
          title: 'Card Title',
          icon: 'Icon',
          max_posts: 'Max posts to display',
          max_height: 'Max card height (CSS value)',
          show_images: 'Show images',
          show_metrics: 'Show engagement metrics',
          repost_action: 'Repost button action',
        };
        return labels[schema.name] || schema.name;
      };
      form.addEventListener('value-changed', (e) => {
        const val = { ...e.detail.value };
        // Text selectors emit undefined when cleared; preserve as ''
        for (const key of ['title', 'max_height']) {
          if (key in val && (val[key] === undefined || val[key] === null)) {
            val[key] = '';
          }
        }
        this._config = { ...this._config, ...val };
        this._fire();
      });
      root.appendChild(form);
      this._form = form;
    }

    this._form.hass = this._hass;
    this._form.data = {
      entity: this._config.entity ?? '',
      title: this._config.title ?? 'Bluesky Feed',
      icon: this._config.icon ?? 'mdi:butterfly-outline',
      max_posts: this._config.max_posts ?? 20,
      max_height: this._config.max_height ?? '600px',
      show_images: this._config.show_images !== false,
      show_metrics: this._config.show_metrics !== false,
      repost_action: this._config.repost_action ?? 'repost',
    };
  }

  _fire() {
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: { ...this._config } },
        bubbles: true,
        composed: true,
      })
    );
  }
}

try {
  customElements.define('bluesky-feed-card-editor', BlueskyFeedCardEditor);
} catch(e) { /* already defined */ }

// ---------------------------------------------------------------------------
// Main Card
// ---------------------------------------------------------------------------

class BlueskyFeedCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement('bluesky-feed-card-editor');
  }

  static getStubConfig() {
    return {
      entity: '',
      title: 'Bluesky Feed',
      icon: 'mdi:butterfly-outline',
      max_posts: 20,
      show_images: true,
      show_metrics: true,
      max_height: '600px',
      repost_action: 'repost',
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._lastUpdated = null;
    this._posts = [];
    this._lightboxHandler = null;
    this._interactionState = new Map();
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('Please define an entity');
    }
    this._config = {
      entity: config.entity,
      title: config.title ?? 'Bluesky Feed',
      icon: config.icon ?? 'mdi:butterfly-outline',
      max_posts: config.max_posts ?? 20,
      show_images: config.show_images !== false,
      show_metrics: config.show_metrics !== false,
      max_height: config.max_height ?? '600px',
      repost_action: config.repost_action ?? 'repost',
    };
    this._buildStructure();
  }

  set hass(hass) {
    this._hass = hass;
    const entity = hass.states[this._config.entity];
    if (!entity) {
      this._renderError('Entity not found: ' + this._config.entity);
      return;
    }
    if (entity.state === 'unavailable') {
      this._renderError('Entity is unavailable');
      return;
    }
    const updated = entity.last_updated;
    if (updated !== this._lastUpdated) {
      this._lastUpdated = updated;
      this._posts = entity.attributes.posts || [];
      // Prune interaction state entries that the server has caught up with
      for (const [uri, state] of this._interactionState) {
        const serverPost = this._posts.find((p) => p.uri === uri);
        if (!serverPost) {
          this._interactionState.delete(uri);
          continue;
        }
        const serverLiked = !!serverPost.viewer_like;
        const serverReposted = !!serverPost.viewer_repost;
        if (state.liked === serverLiked && state.reposted === serverReposted) {
          this._interactionState.delete(uri);
        }
      }
      this._renderPosts();
    }
  }

  _buildStructure() {
    const icon = this._config.icon;
    const title = this._config.title;
    const showHeader = icon || title;
    this.shadowRoot.innerHTML = `
      <style>${CARD_STYLES}</style>
      <ha-card>
        ${showHeader ? `
        <div class="card-header">
          ${icon ? `<ha-icon icon="${escapeHtml(icon)}"></ha-icon>` : ''}
          ${title ? `<span class="header-title">${escapeHtml(title)}</span>` : ''}
        </div>
        ` : ''}
        <div class="feed-container" id="feed"
             style="max-height:${escapeHtml(this._config.max_height || '')}"></div>
      </ha-card>
    `;
  }

  _renderError(message) {
    const feed = this.shadowRoot.getElementById('feed');
    if (!feed) return;
    feed.innerHTML = `
      <div class="error-state">
        <div class="error-state-text">${escapeHtml(message)}</div>
      </div>
    `;
  }

  _renderPosts() {
    const feed = this.shadowRoot.getElementById('feed');
    if (!feed) return;

    const posts = this._posts.slice(0, this._config.max_posts);

    if (posts.length === 0) {
      feed.innerHTML = `
        <div class="empty-state">
          <ha-icon icon="${escapeHtml(this._config.icon)}" style="--mdc-icon-size:48px; color:var(--bsky-blue);"></ha-icon>
          <div class="empty-state-text">No posts yet</div>
        </div>
      `;
      return;
    }

    feed.innerHTML = posts.map((p) => this._renderPost(p)).join('');
    this._attachEventListeners(feed);
  }

  _renderPost(post) {
    const url = postUrl(post.author_handle, post.uri);
    const rawName = post.author_name || post.author_handle || '';
    const avatar = post.author_avatar || defaultAvatar(rawName);
    const name = escapeHtml(rawName);
    const handle = escapeHtml(post.author_handle ? `@${post.author_handle}` : '');
    const time = timeAgo(post.created_at);
    const richText = renderTextWithFacets(post.text, post.facets);

    let repostHtml = '';
    if (post.is_repost && post.reposted_by) {
      repostHtml = `
        <div class="repost-indicator">
          ${ICON_REPOST_SMALL} Reposted by ${escapeHtml(post.reposted_by)}
        </div>
      `;
    }

    let replyHtml = '';
    if (post.is_reply && post.reply_to_name) {
      replyHtml = `
        <div class="reply-indicator">
          ${ICON_REPLY_INDICATOR} Replied to ${escapeHtml(post.reply_to_name)}
        </div>
      `;
    }

    let imagesHtml = '';
    if (this._config.show_images && post.images && post.images.length > 0) {
      const count = Math.min(post.images.length, 4);
      imagesHtml = `
        <div class="post-images count-${count}">
          ${post.images.slice(0, 4).map((img) =>
            `<img class="post-image" src="${escapeHtml(img.thumb || img.fullsize)}"
                  alt="${escapeHtml(img.alt || '')}"
                  data-fullsize="${escapeHtml(img.fullsize || img.thumb)}"
                  loading="lazy" />`
          ).join('')}
        </div>
      `;
    }

    let externalHtml = '';
    if (this._config.show_images && post.external && post.external.uri) {
      const ext = post.external;
      const safeExtUri = sanitizeUrl(ext.uri);
      let domain = '';
      try { domain = new URL(ext.uri).hostname.replace(/^www\./, ''); } catch(e) {}
      if (safeExtUri) externalHtml = `
        <a class="external-card" href="${escapeHtml(safeExtUri)}" target="_blank"
           rel="noopener">
          ${ext.thumb ? `<img class="external-thumb" src="${escapeHtml(ext.thumb)}" loading="lazy" />` : ''}
          <div class="external-info">
            <div class="external-domain">${escapeHtml(domain)}</div>
            ${ext.title ? `<div class="external-title">${escapeHtml(ext.title)}</div>` : ''}
            ${ext.description ? `<div class="external-desc">${escapeHtml(ext.description)}</div>` : ''}
          </div>
        </a>
      `;
    }

    let quoteHtml = '';
    if (post.quote && post.quote.text) {
      const q = post.quote;
      const qAvatar = q.author_avatar || defaultAvatar(q.author_name || q.author_handle);
      quoteHtml = `
        <div class="quote-post">
          <div class="quote-header">
            <img class="quote-avatar" src="${escapeHtml(qAvatar)}"
                 onerror="this.src='${defaultAvatar(q.author_name || q.author_handle)}'" />
            <span class="quote-name">${escapeHtml(q.author_name || q.author_handle || '')}</span>
            <span class="quote-handle">@${escapeHtml(q.author_handle || '')}</span>
          </div>
          <div class="quote-text">${escapeHtml(q.text)}</div>
        </div>
      `;
    }

    let metricsHtml = '';
    if (this._config.show_metrics) {
      const localState = this._interactionState.get(post.uri);
      const isLiked = localState ? localState.liked : !!post.viewer_like;
      const isReposted = localState ? localState.reposted : !!post.viewer_repost;
      const likeCount = localState ? localState.likeCount : (post.like_count || 0);
      const repostCount = localState ? localState.repostCount : (post.repost_count || 0);

      metricsHtml = `
        <div class="metrics">
          <span class="metric reply">${ICON_REPLY} ${formatCount(post.reply_count)}</span>
          <span class="metric repost${isReposted ? ' active' : ''}" data-action="repost">${ICON_REPOST} <span class="metric-count">${formatCount(repostCount)}</span></span>
          <span class="metric like${isLiked ? ' active' : ''}" data-action="like">${ICON_LIKE} <span class="metric-count">${formatCount(likeCount)}</span></span>
        </div>
      `;
    }

    return `
      <div class="post-wrapper">
        ${repostHtml}
        ${replyHtml}
        <div class="post" data-post-url="${escapeHtml(url)}" data-post-uri="${escapeHtml(post.uri || '')}" data-post-cid="${escapeHtml(post.cid || '')}">
          <img class="avatar" src="${escapeHtml(avatar)}" loading="lazy"
               onerror="this.src='${defaultAvatar(rawName)}'" />
          <div class="post-content">
            <div class="post-header">
              <span class="display-name">${name}</span>
              <span class="handle">${handle}</span>
              <span class="separator">&middot;</span>
              <span class="timestamp">${time}</span>
            </div>
            ${richText ? `<div class="post-text">${richText}</div>` : ''}
            ${imagesHtml}
            ${externalHtml}
            ${quoteHtml}
            ${metricsHtml}
          </div>
        </div>
      </div>
    `;
  }

  _attachEventListeners(feed) {
    // Post click opens post on bsky.app (skip if clicking a link, image, metric, or button)
    feed.querySelectorAll('.post').forEach((post) => {
      post.addEventListener('click', (e) => {
        const target = e.target.closest('a, .post-image, .external-card, .metric[data-action]');
        if (target) return;
        const url = post.dataset.postUrl;
        if (url && url !== '#') {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.click();
        }
      });
    });

    // Image click opens lightbox
    feed.querySelectorAll('.post-image').forEach((img) => {
      img.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openLightbox(img.dataset.fullsize || img.src);
      });
    });

    // Like button clicks
    feed.querySelectorAll('.metric[data-action="like"]').forEach((metricEl) => {
      metricEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const postEl = metricEl.closest('.post');
        if (postEl) this._handleLikeClick(postEl, metricEl);
      });
    });

    // Repost button clicks
    feed.querySelectorAll('.metric[data-action="repost"]').forEach((metricEl) => {
      metricEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const postEl = metricEl.closest('.post');
        if (postEl) this._handleRepostClick(postEl, metricEl);
      });
    });
  }

  _getPostData(postUri) {
    return this._posts.find((p) => p.uri === postUri) || {};
  }

  async _handleLikeClick(postEl, metricEl) {
    if (metricEl.classList.contains('loading')) return;

    const postUri = postEl.dataset.postUri;
    const postCid = postEl.dataset.postCid;
    const post = this._getPostData(postUri);
    const localState = this._interactionState.get(postUri);
    const isCurrentlyLiked = localState ? localState.liked : !!post.viewer_like;
    const currentCount = localState ? localState.likeCount : (post.like_count || 0);

    // Optimistic UI update
    const newLiked = !isCurrentlyLiked;
    const newCount = newLiked ? currentCount + 1 : Math.max(0, currentCount - 1);
    metricEl.classList.toggle('active', newLiked);
    const countEl = metricEl.querySelector('.metric-count');
    if (countEl) countEl.textContent = formatCount(newCount);
    metricEl.classList.add('loading');

    try {
      if (newLiked) {
        const result = await this._hass.callService('bluesky_feed', 'like', {
          entity_id: this._config.entity,
          uri: postUri,
          cid: postCid,
        }, undefined, true, true);
        const recordUri = result?.response?.record_uri || '';
        this._interactionState.set(postUri, {
          ...(localState || {}),
          liked: true,
          likeCount: newCount,
          likeRecordUri: recordUri,
          reposted: localState?.reposted ?? !!post.viewer_repost,
          repostCount: localState?.repostCount ?? (post.repost_count || 0),
        });
      } else {
        const recordUri = localState?.likeRecordUri || post.viewer_like || '';
        if (recordUri) {
          await this._hass.callService('bluesky_feed', 'unlike', {
            entity_id: this._config.entity,
            record_uri: recordUri,
          });
        }
        this._interactionState.set(postUri, {
          ...(localState || {}),
          liked: false,
          likeCount: newCount,
          likeRecordUri: '',
          reposted: localState?.reposted ?? !!post.viewer_repost,
          repostCount: localState?.repostCount ?? (post.repost_count || 0),
        });
      }
    } catch (err) {
      // Revert optimistic UI
      metricEl.classList.toggle('active', isCurrentlyLiked);
      if (countEl) countEl.textContent = formatCount(currentCount);
      console.error('Bluesky like action failed:', err);
    } finally {
      metricEl.classList.remove('loading');
    }
  }

  async _handleRepostClick(postEl, metricEl) {
    const postUri = postEl.dataset.postUri;

    // Quote mode: open bsky.app compose in new tab
    if (this._config.repost_action === 'quote') {
      const link = document.createElement('a');
      link.href = `https://bsky.app/intent/compose?quote=${encodeURIComponent(postUri)}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.click();
      return;
    }

    // Repost mode: toggle repost via API
    if (metricEl.classList.contains('loading')) return;

    const postCid = postEl.dataset.postCid;
    const post = this._getPostData(postUri);
    const localState = this._interactionState.get(postUri);
    const isCurrentlyReposted = localState ? localState.reposted : !!post.viewer_repost;
    const currentCount = localState ? localState.repostCount : (post.repost_count || 0);

    // Optimistic UI update
    const newReposted = !isCurrentlyReposted;
    const newCount = newReposted ? currentCount + 1 : Math.max(0, currentCount - 1);
    metricEl.classList.toggle('active', newReposted);
    const countEl = metricEl.querySelector('.metric-count');
    if (countEl) countEl.textContent = formatCount(newCount);
    metricEl.classList.add('loading');

    try {
      if (newReposted) {
        const result = await this._hass.callService('bluesky_feed', 'repost', {
          entity_id: this._config.entity,
          uri: postUri,
          cid: postCid,
        }, undefined, true, true);
        const recordUri = result?.response?.record_uri || '';
        this._interactionState.set(postUri, {
          ...(localState || {}),
          reposted: true,
          repostCount: newCount,
          repostRecordUri: recordUri,
          liked: localState?.liked ?? !!post.viewer_like,
          likeCount: localState?.likeCount ?? (post.like_count || 0),
        });
      } else {
        const recordUri = localState?.repostRecordUri || post.viewer_repost || '';
        if (recordUri) {
          await this._hass.callService('bluesky_feed', 'unrepost', {
            entity_id: this._config.entity,
            record_uri: recordUri,
          });
        }
        this._interactionState.set(postUri, {
          ...(localState || {}),
          reposted: false,
          repostCount: newCount,
          repostRecordUri: '',
          liked: localState?.liked ?? !!post.viewer_like,
          likeCount: localState?.likeCount ?? (post.like_count || 0),
        });
      }
    } catch (err) {
      // Revert optimistic UI
      metricEl.classList.toggle('active', isCurrentlyReposted);
      if (countEl) countEl.textContent = formatCount(currentCount);
      console.error('Bluesky repost action failed:', err);
    } finally {
      metricEl.classList.remove('loading');
    }
  }

  _openLightbox(imageUrl) {
    // Remove any existing lightbox
    this._closeLightbox();

    const overlay = document.createElement('div');
    overlay.className = 'bluesky-feed-lightbox';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.88); display: flex; align-items: center;
      justify-content: center; z-index: 9999; cursor: pointer;
      padding: 20px; box-sizing: border-box;
      animation: fadeIn 0.2s ease;
    `;

    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
      max-width: 100%; max-height: 100%; object-fit: contain;
      border-radius: 8px; cursor: default;
    `;
    img.addEventListener('click', (e) => e.stopPropagation());

    overlay.appendChild(img);
    overlay.addEventListener('click', () => this._closeLightbox());

    this._lightboxHandler = (e) => {
      if (e.key === 'Escape') this._closeLightbox();
    };
    document.addEventListener('keydown', this._lightboxHandler);
    document.body.appendChild(overlay);
    this._lightboxEl = overlay;
  }

  _closeLightbox() {
    if (this._lightboxEl) {
      this._lightboxEl.remove();
      this._lightboxEl = null;
    }
    if (this._lightboxHandler) {
      document.removeEventListener('keydown', this._lightboxHandler);
      this._lightboxHandler = null;
    }
  }

  getCardSize() {
    return Math.max(3, Math.min(this._posts.length, 8));
  }
}

try {
  customElements.define('bluesky-feed-card', BlueskyFeedCard);
} catch(e) { /* already defined */ }

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'bluesky-feed-card')) {
  window.customCards.push({
    type: 'bluesky-feed-card',
    name: 'Bluesky Feed',
    description: 'Display a Bluesky social media feed timeline',
    preview: true,
  });
}

console.info(
  `%c BLUESKY-FEED-CARD %c v${CARD_VERSION} `,
  'color: white; background: #1185fe; font-weight: 700; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'color: #1185fe; background: #e8f4fd; font-weight: 700; padding: 2px 6px; border-radius: 0 4px 4px 0;'
);
