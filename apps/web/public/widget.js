/**
 * Wayrune Conversation Widget — embeddable SDK.
 *
 * HubSpot-style chat-first UI: open → conversation + composer.
 * WhatsApp is a single secondary action when configured.
 *
 * Usage:
 *   <script src="https://YOUR_APP/widget.js"
 *     data-org="10023"
 *     data-key="PUBLIC_KEY"
 *     data-api="https://YOUR_API"
 *     data-widget="WIDGET_ID"
 *     data-site="SITE_ID"
 *     data-path="/"
 *     data-source="presence"
 *     data-position="bottom-right"
 *     data-drag="1"
 *     data-color="#0f766e"></script>
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var orgId = script.getAttribute('data-org') || '';
  var publicKey = script.getAttribute('data-key') || '';
  var apiBase = (script.getAttribute('data-api') || '').replace(/\/$/, '');
  var position = script.getAttribute('data-position') || 'bottom-right';
  var widgetId = script.getAttribute('data-widget') || '';
  var siteId = script.getAttribute('data-site') || '';
  var dataPath = script.getAttribute('data-path') || '';
  var dataSource = script.getAttribute('data-source') || (siteId ? 'presence' : 'embed');
  var allowDragAttr = script.getAttribute('data-drag') === '1';
  var accentOverride = script.getAttribute('data-color') || '';
  if (!orgId || !publicKey || !apiBase) return;

  var dragStorageKey = 'cp_widget_inset_v3_' + orgId + '_' + (widgetId || publicKey);
  var LAUNCHER_SIZE = 56;
  var STACK_GAP = 12;
  var EDGE_GAP = 20;
  var PANEL_W = 380;

  /** Conversation thread — persisted so refresh keeps history. */
  var threadKey = 'cp_widget_thread_v1_' + orgId + '_' + (widgetId || publicKey);
  var conversationKey = 'cp_widget_conversation_v1_' + orgId + '_' + (widgetId || publicKey);
  var THREAD_MAX = 80;
  var threadState = loadThreadState();
  var thread = threadState.messages;
  var ackSent = threadState.ackSent;
  var typing = false;
  var conversationId = loadConversationId();
  var messagesEl = null;
  var pollTimer = null;
  var unreadAgent = 0;
  var visitorKey = 'cp_widget_visitor_v1_' + orgId;
  var visitor = loadVisitor();

  function phoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function playNotifySound() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var now = ctx.currentTime;
      var gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.28);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.36);
      setTimeout(function () {
        ctx.close && ctx.close();
      }, 500);
    } catch (e) {
      /* ignore autoplay / audio errors */
    }
  }

  function sortThread() {
    thread.sort(function (a, b) {
      var ta = typeof a.at === 'number' ? a.at : 0;
      var tb = typeof b.at === 'number' ? b.at : 0;
      if (ta !== tb) return ta - tb;
      if (a.serverId && b.serverId && a.serverId !== b.serverId) {
        return a.serverId < b.serverId ? -1 : 1;
      }
      return 0;
    });
  }

  function refreshMessagesUi() {
    sortThread();
    if (messagesEl) renderMessages(messagesEl);
    if (!open) renderLauncher();
  }

  function pollAgentReplies() {
    if (!config) return;
    if (!conversationId && !(visitor && (visitor.email || visitor.phone))) return;

    var params = new URLSearchParams({ publicKey: publicKey });
    if (conversationId) params.set('conversationId', conversationId);
    if (visitor && visitor.email) params.set('email', visitor.email);
    if (visitor && visitor.phone) {
      params.set('phone', visitor.phone);
      var dig = phoneDigits(visitor.phone);
      if (dig && dig !== visitor.phone) params.set('phone', dig.length >= 10 ? dig.slice(-10) : dig);
      // Prefer raw visitor phone; API also normalizes.
      params.set('phone', visitor.phone);
    }

    fetch(
      apiBase +
        '/leads/widget/' +
        encodeURIComponent(orgId) +
        '/messages?' +
        params.toString(),
    )
      .then(function (r) {
        if (!r.ok) throw new Error('poll');
        return r.json();
      })
      .then(function (data) {
        if (data && data.conversationId) saveConversationId(data.conversationId);
        var list = (data && data.messages) || [];
        if (!list.length) return;
        var known = {};
        for (var i = 0; i < thread.length; i++) {
          if (thread[i].serverId) known[thread[i].serverId] = true;
        }
        var added = 0;
        var addedAgent = 0;
        for (var j = 0; j < list.length; j++) {
          var msg = list[j];
          if (!msg || !msg.id || known[msg.id]) continue;
          if (typeof msg.text !== 'string' || !msg.text.trim()) continue;
          var direction = msg.direction === 'inbound' ? 'inbound' : 'outbound';
          var role = direction === 'inbound' ? 'visitor' : 'agent';
          // Skip local visitor echoes that were sent before we had a serverId.
          if (role === 'visitor') {
            var dup = false;
            for (var k = 0; k < thread.length; k++) {
              var local = thread[k];
              if (
                local.role === 'visitor' &&
                !local.serverId &&
                local.text === msg.text.trim()
              ) {
                local.serverId = msg.id;
                local.status = 'sent';
                known[msg.id] = true;
                dup = true;
                break;
              }
            }
            if (dup) continue;
          }
          thread.push({
            role: role,
            text: msg.text.trim(),
            at: msg.at ? new Date(msg.at).getTime() : Date.now(),
            serverId: msg.id,
            status: role === 'visitor' ? 'sent' : undefined,
          });
          known[msg.id] = true;
          added += 1;
          if (role === 'agent') addedAgent += 1;
        }
        if (!added) return;
        saveThread();
        if (addedAgent) playNotifySound();
        if (open) {
          refreshMessagesUi();
        } else if (addedAgent) {
          unreadAgent += addedAgent;
          openWidget();
        }
      })
      .catch(function () {
        /* ignore poll errors */
      });
  }

  function startPolling() {
    stopPolling();
    pollAgentReplies();
    pollTimer = setInterval(pollAgentReplies, open ? 2000 : 4000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function loadThreadState() {
    try {
      var raw = localStorage.getItem(threadKey);
      if (!raw) return { messages: [], ackSent: false };
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.messages)) return { messages: [], ackSent: false };
      var messages = [];
      for (var i = 0; i < parsed.messages.length; i++) {
        var m = parsed.messages[i];
        if (!m || (m.role !== 'visitor' && m.role !== 'agent')) continue;
        if (typeof m.text !== 'string' || !m.text.trim()) continue;
        var row = {
          role: m.role,
          text: m.text,
          at: typeof m.at === 'number' ? m.at : Date.now(),
          status: m.role === 'visitor' ? (m.status === 'failed' ? 'failed' : 'sent') : undefined,
        };
        if (typeof m.serverId === 'string' && m.serverId) row.serverId = m.serverId;
        messages.push(row);
      }
      return {
        messages: messages.slice(-THREAD_MAX),
        ackSent: Boolean(parsed.ackSent),
      };
    } catch (e) {
      /* ignore */
    }
    return { messages: [], ackSent: false };
  }

  function saveThread() {
    try {
      localStorage.setItem(
        threadKey,
        JSON.stringify({
          messages: thread.slice(-THREAD_MAX),
          ackSent: ackSent,
        }),
      );
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  function loadConversationId() {
    try {
      var id = localStorage.getItem(conversationKey);
      return id && id.trim() ? id.trim() : null;
    } catch (e) {
      return null;
    }
  }

  function saveConversationId(id) {
    if (!id || typeof id !== 'string') return;
    conversationId = id.trim();
    try {
      localStorage.setItem(conversationKey, conversationId);
    } catch (e) {
      /* ignore */
    }
  }

  function rememberConversationFromIngest(data) {
    var id =
      (data && data.interaction && data.interaction.conversationId) ||
      (data && data.conversationId) ||
      null;
    if (id) saveConversationId(id);
  }

  function loadVisitor() {
    try {
      var raw = localStorage.getItem(visitorKey);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) return null;
      var email = typeof parsed.email === 'string' ? parsed.email.trim() : '';
      var phone = typeof parsed.phone === 'string' ? parsed.phone.trim() : '';
      var emailOk = Boolean(email && isValidEmail(email));
      var phoneOk = Boolean(phone && isValidPhone(phone));
      if (!emailOk && !phoneOk) return null;
      return {
        name: parsed.name.trim(),
        email: emailOk ? email : '',
        phone: phoneOk ? phone : '',
      };
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function saveVisitor(next) {
    visitor = {
      name: String(next.name || '').trim(),
      email: String(next.email || '').trim(),
      phone: String(next.phone || '').trim(),
    };
    try {
      localStorage.setItem(visitorKey, JSON.stringify(visitor));
    } catch (e) {
      /* ignore */
    }
  }

  function hasVisitor() {
    if (!visitor || !visitor.name) return false;
    if (visitor.email && isValidEmail(visitor.email)) return true;
    if (visitor.phone && isValidPhone(visitor.phone)) return true;
    return false;
  }

  function isValidEmail(value) {
    var email = String(value || '').trim();
    if (!email || email.length > 254) return false;
    // Practical RFC-ish check: local@domain.tld, no spaces, one @.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return false;
    if (email.indexOf('..') !== -1) return false;
    var parts = email.split('@');
    if (parts.length !== 2) return false;
    if (parts[0].length < 1 || parts[0].length > 64) return false;
    if (parts[1].indexOf('.') === -1) return false;
    return true;
  }

  /** Matches packages/contracts isValidPhone — 10-digit national or +country. */
  function isValidPhone(raw) {
    var digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return false;
    if (/^\d{10}$/.test(digits)) return true;
    var known = ['91', '971', '65', '44', '1'];
    for (var i = 0; i < known.length; i++) {
      var code = known[i];
      if (digits.indexOf(code) === 0 && digits.length === code.length + 10) return true;
    }
    if (digits.length >= 11 && digits.length <= 14) {
      var national = digits.slice(-10);
      var country = digits.slice(0, -10);
      return /^[1-9]\d{0,3}$/.test(country) && /^\d{10}$/.test(national);
    }
    return false;
  }

  function visitorContactLabel() {
    if (!visitor) return '';
    if (visitor.email) return visitor.email;
    if (visitor.phone) return visitor.phone;
    return '';
  }

  function attribution() {
    var path =
      dataPath ||
      (typeof location !== 'undefined' && location.pathname ? location.pathname : '') ||
      null;
    return {
      widgetId: widgetId || null,
      siteId: siteId || null,
      path: path,
      pageUrl: typeof location !== 'undefined' ? location.href : null,
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      source: dataSource === 'presence' ? 'presence' : 'embed',
    };
  }

  function isTopPosition(pos) {
    return pos === 'top-left' || pos === 'top-right';
  }

  function isLeftPosition(pos) {
    return pos === 'bottom-left' || pos === 'top-left';
  }

  function readSavedXy() {
    try {
      var raw = localStorage.getItem(dragStorageKey);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.v === 3 && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return { x: parsed.x, y: parsed.y };
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function saveInsets(x, y) {
    try {
      localStorage.setItem(
        dragStorageKey,
        JSON.stringify({ v: 3, x: Math.round(x), y: Math.round(y) }),
      );
    } catch (e) {
      /* ignore */
    }
  }

  function clearSavedXy() {
    try {
      localStorage.removeItem(dragStorageKey);
      // Clear legacy keys that caused the “slides left on click” bug.
      localStorage.removeItem('cp_widget_xy_' + orgId + '_' + (widgetId || publicKey));
    } catch (e) {
      /* ignore */
    }
  }

  function allowDrag() {
    if (config && typeof config.allowDrag === 'boolean') return config.allowDrag;
    return allowDragAttr;
  }

  function accentColor() {
    // Prefer script override (Presence inject uses org accent), then config (also org).
    return accentOverride || (config && config.primaryColor) || '#0f766e';
  }

  function withinHours() {
    if (!config || typeof config.withinHours !== 'boolean') return true;
    return config.withinHours;
  }

  function brandName() {
    return (config && config.brandName) || 'Support';
  }

  function greetingText() {
    if (!withinHours()) {
      return (
        (config && config.afterHoursMessage) ||
        'We are currently outside operating hours. Leave a message and we will reply soon.'
      );
    }
    return (config && config.defaultGreeting) || "Got any questions? I'm happy to help.";
  }

  function replyHint() {
    return (config && config.replyTimeHint) || 'We typically reply in a few minutes';
  }

  function hasWhatsApp() {
    return Boolean(config && config.whatsappNumber);
  }

  function pin(prop, value) {
    root.style.setProperty(prop, value, 'important');
  }

  function panelBoxCss() {
    var h =
      'height:min(560px, calc(100vh - ' + (LAUNCHER_SIZE + STACK_GAP + EDGE_GAP * 2) + 'px));';
    return (
      'position:relative;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;' +
      'pointer-events:auto;flex:0 0 auto;' +
      'width:min(' +
      PANEL_W +
      'px, calc(100vw - ' +
      EDGE_GAP * 2 +
      'px));' +
      h +
      'background:#fff;border-radius:20px;color:#0f172a;' +
      'box-shadow:0 24px 64px rgba(15,23,42,.28), 0 0 0 1px rgba(15,23,42,.06);'
    );
  }

  function launcherBoxCss() {
    return (
      'position:relative;flex:0 0 auto;width:' +
      LAUNCHER_SIZE +
      'px;height:' +
      LAUNCHER_SIZE +
      'px;border:none;border-radius:999px;padding:0;margin:0;' +
      'display:inline-flex;align-items:center;justify-content:center;pointer-events:auto;' +
      'background:linear-gradient(145deg,' +
      accentColor() +
      ',color-mix(in srgb,' +
      accentColor() +
      ' 72%,#0f172a));' +
      'color:#fff;cursor:' +
      (allowDrag() ? 'grab' : 'pointer') +
      ';box-shadow:0 12px 32px color-mix(in srgb,' +
      accentColor() +
      ' 45%,transparent),0 4px 12px rgba(15,23,42,.18)'
    );
  }

  var liveInsets = { x: EDGE_GAP, y: EDGE_GAP };

  /**
   * Viewport-fixed stack. Flex keeps panel + launcher aligned to the configured
   * corner. !important beats host-page CSS; no absolute/0×0 math.
   */
  function applyRootLayout() {
    var saved = allowDrag() ? readSavedXy() : null;
    var font =
      (config && config.fontFamily) ||
      'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    var x = EDGE_GAP;
    var y = EDGE_GAP;
    if (saved) {
      x = Math.max(EDGE_GAP, Math.min(window.innerWidth - LAUNCHER_SIZE - EDGE_GAP, saved.x));
      y = Math.max(EDGE_GAP, Math.min(window.innerHeight - LAUNCHER_SIZE - EDGE_GAP, saved.y));
    }
    liveInsets = { x: x, y: y };

    // Reset then pin — avoid leftover left/top from drag intermediate states.
    root.removeAttribute('style');
    pin('all', 'initial');
    pin('position', 'fixed');
    pin('z-index', '2147483646');
    pin('display', 'flex');
    pin('flex-direction', isTopPosition(position) ? 'column-reverse' : 'column');
    pin('align-items', isLeftPosition(position) ? 'flex-start' : 'flex-end');
    pin('justify-content', 'flex-start');
    pin('gap', STACK_GAP + 'px');
    pin('width', 'max-content');
    pin('max-width', 'calc(100vw - ' + EDGE_GAP * 2 + 'px)');
    pin('height', 'auto');
    pin('margin', '0');
    pin('padding', '0');
    pin('border', '0');
    pin('background', 'transparent');
    pin('box-sizing', 'border-box');
    pin('pointer-events', 'none');
    pin('overflow', 'visible');
    pin('transform', 'none');
    pin('filter', 'none');
    pin('inset', 'auto');
    pin('font-family', font);
    pin('color', '#0f172a');
    pin('line-height', '1.45');
    pin('text-align', 'left');
    pin('direction', 'ltr');

    if (isLeftPosition(position)) {
      pin('left', x + 'px');
      pin('right', 'auto');
    } else {
      pin('right', x + 'px');
      pin('left', 'auto');
    }
    if (isTopPosition(position)) {
      pin('top', y + 'px');
      pin('bottom', 'auto');
    } else {
      pin('bottom', y + 'px');
      pin('top', 'auto');
    }

    layoutChildren();
  }

  function layoutChildren() {
    var panel = root.querySelector('[data-cp-panel]');
    var launcher = root.querySelector('[data-cp-launcher]');
    if (panel) panel.style.cssText = panelBoxCss();
    if (launcher) launcher.style.cssText = launcherBoxCss();
  }

  var root = document.createElement('div');
  root.id = 'cp-travel-widget';
  // Attach to <html> so body layout / overflow never owns the widget.
  (document.documentElement || document.body).appendChild(root);
  // Drop legacy drag coords once so corners stay pinned.
  try {
    localStorage.removeItem('cp_widget_xy_' + orgId + '_' + (widgetId || publicKey));
  } catch (e) {}


  var open = false;
  var config = null;
  var pendingOpen = Boolean(window.__wrWidgetPendingOpen || window.__cpWidgetPendingOpen);
  var dragging = false;
  var dragMoved = false;

  applyRootLayout();

  function uid() {
    return 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function setPendingOpenFlag(value) {
    window.__wrWidgetPendingOpen = value;
    window.__cpWidgetPendingOpen = value;
  }

  function openWidget() {
    if (!config) {
      pendingOpen = true;
      setPendingOpenFlag(true);
      return;
    }
    setPendingOpenFlag(false);
    pendingOpen = false;
    open = true;
    unreadAgent = 0;
    renderChat();
    startPolling();
  }

  function closeWidget() {
    open = false;
    pendingOpen = false;
    setPendingOpenFlag(false);
    messagesEl = null;
    if (config) renderLauncher();
    startPolling();
  }

  var widgetApi = {
    open: openWidget,
    close: closeWidget,
    isReady: function () {
      return Boolean(config);
    },
    setPosition: function (pos) {
      position = pos || 'bottom-right';
      clearSavedXy();
      applyRootLayout();
    },
  };

  window.WayruneWidget = widgetApi;
  // Compat shim — remove in a later breaking release
  window.CodePoetryWidget = widgetApi;

  window.addEventListener('wr-widget:open', function () {
    openWidget();
  });
  window.addEventListener('cp-widget:open', function () {
    openWidget();
  });

  window.addEventListener('resize', function () {
    applyRootLayout();
  });

  function chatIconSvg() {
    return (
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M7 8h10M7 12h6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M12 21a9 9 0 1 0-7.5-4L3 21l4.2-1.2A8.9 8.9 0 0 0 12 21Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>' +
      '</svg>'
    );
  }

  function sendIconSvg() {
    return (
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M3.4 20.4 21 12 3.4 3.6 3 10.2l11 1.8L3 13.8z"/>' +
      '</svg>'
    );
  }

  function waIconSvg() {
    return (
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.99.58 3.84 1.6 5.43L2 22l4.9-1.66a9.86 9.86 0 0 0 5.14 1.42h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.75 14.16c-.24.67-1.4 1.23-1.94 1.31-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.26-4.79-4.18-4.93-4.38-.14-.2-1.15-1.53-1.15-2.92 0-1.39.73-2.07.99-2.35.26-.28.57-.35.76-.35h.55c.17 0 .4-.06.62.47.24.56.81 1.96.88 2.1.07.14.12.31.02.5-.1.2-.15.32-.3.49-.14.17-.3.38-.43.51-.14.14-.29.29-.12.57.17.28.75 1.23 1.61 2 .99.99 1.82 1.3 2.1 1.44.28.14.44.12.6-.07.17-.2.7-.81.89-1.09.19-.28.38-.23.64-.14.26.1 1.66.78 1.94.92.28.14.47.21.54.32.07.12.07.67-.17 1.34z"/>' +
      '</svg>'
    );
  }

  function closeIconSvg() {
    return (
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      '</svg>'
    );
  }

  function formatTime(ts) {
    try {
      var d = new Date(ts || Date.now());
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function initials(name) {
    var parts = String(name || 'S')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return 'S';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
  }

  function avatarNode(size, opts) {
    opts = opts || {};
    var s = size || 36;
    var node = el(
      'div',
      'position:relative;width:' +
        s +
        'px;height:' +
        s +
        'px;border-radius:999px;flex-shrink:0;' +
        'display:inline-flex;align-items:center;justify-content:center;' +
        'font-weight:700;font-size:' +
        Math.max(11, Math.round(s * 0.36)) +
        'px;letter-spacing:-0.02em;' +
        'color:#fff;background:linear-gradient(145deg,' +
        accentColor() +
        ',color-mix(in srgb,' +
        accentColor() +
        ' 55%,#0f172a));' +
        'box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);' +
        (opts.ring
          ? 'box-shadow:0 0 0 2px #fff, inset 0 0 0 1px rgba(255,255,255,.22);'
          : ''),
    );
    node.textContent = initials(opts.name || brandName());
    if (opts.online) {
      var dot = el(
        'span',
        'position:absolute;right:0;bottom:0;width:' +
          Math.max(8, Math.round(s * 0.28)) +
          'px;height:' +
          Math.max(8, Math.round(s * 0.28)) +
          'px;border-radius:999px;background:#22c55e;' +
          'box-shadow:0 0 0 2px ' +
          (opts.dotOnDark ? accentColor() : '#fff') +
          ';',
      );
      node.appendChild(dot);
    }
    return node;
  }

  function bindDrag(launcher) {
    if (!allowDrag()) return;
    var startX = 0;
    var startY = 0;
    var origin = { x: EDGE_GAP, y: EDGE_GAP };

    function applyLiveInsets(nextX, nextY) {
      liveInsets = { x: nextX, y: nextY };
      if (isLeftPosition(position)) {
        pin('left', nextX + 'px');
        pin('right', 'auto');
      } else {
        pin('right', nextX + 'px');
        pin('left', 'auto');
      }
      if (isTopPosition(position)) {
        pin('top', nextY + 'px');
        pin('bottom', 'auto');
      } else {
        pin('bottom', nextY + 'px');
        pin('top', 'auto');
      }
    }

    function onMove(e) {
      if (!dragging) return;
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      var dx = clientX - startX;
      var dy = clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;

      var nextX = origin.x + (isLeftPosition(position) ? dx : -dx);
      var nextY = origin.y + (isTopPosition(position) ? dy : -dy);
      nextX = Math.max(EDGE_GAP, Math.min(window.innerWidth - LAUNCHER_SIZE - EDGE_GAP, nextX));
      nextY = Math.max(EDGE_GAP, Math.min(window.innerHeight - LAUNCHER_SIZE - EDGE_GAP, nextY));
      applyLiveInsets(nextX, nextY);
      if (e.cancelable) e.preventDefault();
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      // Only persist after a real drag — clicks must not rewrite corner insets.
      if (dragMoved) {
        saveInsets(liveInsets.x, liveInsets.y);
      }
      applyRootLayout();
      setTimeout(function () {
        dragMoved = false;
      }, 0);
    }

    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      dragMoved = false;
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX;
      startY = clientY;
      origin = { x: liveInsets.x, y: liveInsets.y };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    launcher.addEventListener('mousedown', onDown);
    launcher.addEventListener('touchstart', onDown, { passive: true });
  }

  function renderLauncher() {
    var existing = root.querySelector('[data-cp-launcher]');
    if (existing) existing.remove();
    if (!open) {
      var oldPanel = root.querySelector('[data-cp-panel]');
      if (oldPanel) oldPanel.remove();
      root.innerHTML = '';
    }
    var launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.setAttribute('data-cp-launcher', '1');
    launcher.setAttribute('aria-label', open ? 'Close chat' : 'Open chat');
    launcher.style.cssText = launcherBoxCss() + (open ? '' : 'position:relative;');
    if (open) {
      launcher.innerHTML = '<span style="font-size:22px;line-height:1;color:#fff">×</span>';
    } else {
      launcher.innerHTML = chatIconSvg();
      if (unreadAgent > 0) {
        var badge = document.createElement('span');
        badge.textContent = unreadAgent > 9 ? '9+' : String(unreadAgent);
        badge.style.cssText =
          'position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;' +
          'border-radius:999px;background:#ef4444;color:#fff;font:700 10px/18px system-ui,sans-serif;' +
          'box-shadow:0 0 0 2px #fff;box-sizing:border-box;text-align:center;';
        launcher.appendChild(badge);
      }
    }
    launcher.onclick = function () {
      if (dragMoved) return;
      if (open) closeWidget();
      else openWidget();
    };
    bindDrag(launcher);
    root.appendChild(launcher);
    applyRootLayout();
  }

  function submit(mode, fields) {
    var attr = attribution();
    var name = (fields && fields.name) || (visitor && visitor.name) || null;
    var email = (fields && fields.email) || (visitor && visitor.email) || null;
    var phone = (fields && fields.phone) || (visitor && visitor.phone) || null;
    return fetch(apiBase + '/leads/widget/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: orgId,
        publicKey: publicKey,
        mode: mode,
        message: fields.message || null,
        contactName: name,
        email: email,
        phone: phone || null,
        destinations: fields.destinations || null,
        formKey: fields.formKey || null,
        widgetId: attr.widgetId,
        siteId: attr.siteId,
        path: attr.path,
        pageUrl: attr.pageUrl,
        referrer: attr.referrer,
        source: attr.source,
        idempotencyKey: uid(),
      }),
    }).then(function (r) {
      if (!r.ok) throw new Error('Send failed');
      return r.json();
    }).then(function (data) {
      rememberConversationFromIngest(data);
      // Pull agency replies right away (other tab / staff already typing).
      pollAgentReplies();
      return data;
    });
  }

  function openWhatsApp() {
    if (!hasWhatsApp()) return;
    window.open(
      'https://wa.me/' + String(config.whatsappNumber).replace(/\D/g, ''),
      '_blank',
      'noopener,noreferrer',
    );
    submit('whatsapp', { message: 'Opened WhatsApp from widget' }).catch(function () {});
  }

  function ensureGreetingMessage() {
    if (thread.length) return;
    thread.push({ role: 'agent', text: greetingText(), at: Date.now() });
    saveThread();
  }

  function el(tag, css, html) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function scrollMessagesToBottom(listEl) {
    var el = listEl || messagesEl;
    if (!el) return;
    function pin() {
      el.scrollTop = el.scrollHeight;
    }
    pin();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        pin();
        requestAnimationFrame(pin);
      });
    }
    setTimeout(pin, 40);
    setTimeout(pin, 120);
  }

  function renderMessages(listEl) {
    sortThread();
    listEl.innerHTML = '';
    thread.forEach(function (msg, index) {
      var isVisitor = msg.role === 'visitor';
      var showAvatar =
        !isVisitor && (index === 0 || (thread[index - 1] && thread[index - 1].role !== 'agent'));
      var row = el(
        'div',
        isVisitor
          ? 'display:flex;flex-direction:column;align-items:flex-end;width:100%;box-sizing:border-box;margin:0 0 14px;'
          : 'display:flex;align-items:flex-end;gap:8px;width:100%;box-sizing:border-box;margin:0 0 14px;',
      );

      if (!isVisitor) {
        if (showAvatar) {
          row.appendChild(avatarNode(28, { name: brandName(), ring: true }));
        } else {
          row.appendChild(el('div', 'width:28px;flex-shrink:0;'));
        }
      }

      var col = el(
        'div',
        isVisitor
          ? 'display:flex;flex-direction:column;align-items:flex-end;max-width:82%;'
          : 'display:flex;flex-direction:column;align-items:flex-start;max-width:82%;',
      );
      var bubble = el(
        'div',
        isVisitor
          ? 'padding:11px 14px;border-radius:18px 18px 6px 18px;background:' +
              accentColor() +
              ';color:#fff;font-size:14px;line-height:1.5;letter-spacing:-0.01em;' +
              'box-shadow:0 6px 16px color-mix(in srgb,' +
              accentColor() +
              ' 28%,transparent);'
          : 'padding:11px 14px;border-radius:18px 18px 18px 6px;background:#fff;color:#0f172a;' +
              'font-size:14px;line-height:1.5;letter-spacing:-0.01em;' +
              'border:1px solid rgba(15,23,42,.06);box-shadow:0 4px 14px rgba(15,23,42,.06);',
      );
      bubble.textContent = msg.text;
      col.appendChild(bubble);

      var meta = el(
        'div',
        'margin-top:4px;font-size:10px;font-weight:500;color:#94a3b8;padding:0 4px;',
      );
      if (isVisitor) {
        meta.textContent =
          (msg.status === 'sending'
            ? 'Sending…'
            : msg.status === 'failed'
              ? 'Not sent'
              : 'Delivered') +
          ' · ' +
          formatTime(msg.at);
      } else {
        meta.textContent = formatTime(msg.at);
      }
      col.appendChild(meta);
      row.appendChild(col);
      listEl.appendChild(row);
    });

    if (typing) {
      var tip = el('div', 'display:flex;align-items:flex-end;gap:8px;margin:0 0 8px;');
      tip.appendChild(avatarNode(28, { name: brandName(), ring: true }));
      var dots = el(
        'div',
        'display:inline-flex;align-items:center;gap:5px;padding:12px 14px;border-radius:18px 18px 18px 6px;' +
          'background:#fff;border:1px solid rgba(15,23,42,.06);box-shadow:0 4px 14px rgba(15,23,42,.06);',
      );
      for (var i = 0; i < 3; i++) {
        dots.appendChild(
          el(
            'span',
            'width:6px;height:6px;border-radius:999px;background:#94a3b8;' +
              'animation:cpDot 1.2s ease-in-out ' +
              i * 0.15 +
              's infinite;',
          ),
        );
      }
      tip.appendChild(dots);
      listEl.appendChild(tip);
    }

    scrollMessagesToBottom(listEl);
  }

  function renderChat() {
    ensureGreetingMessage();
    var old = root.querySelector('[data-cp-panel]');
    if (old) old.remove();

    var panel = el('div');
    panel.setAttribute('data-cp-panel', '1');
    panel.setAttribute('data-cp-panel-kind', 'chat');
    panel.style.cssText = panelBoxCss();

    var styleTag = document.createElement('style');
    styleTag.textContent =
      '@keyframes cpDot{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-3px);opacity:1}}' +
      '#cp-travel-widget textarea::placeholder{color:#94a3b8}' +
      '#cp-travel-widget [data-cp-messages]::-webkit-scrollbar{width:6px}' +
      '#cp-travel-widget [data-cp-messages]::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:99px}';
    panel.appendChild(styleTag);

    var header = el(
      'div',
      'flex-shrink:0;display:flex;align-items:center;gap:12px;padding:16px 14px 16px 16px;color:#fff;' +
        'background:linear-gradient(135deg,' +
        accentColor() +
        ' 0%,color-mix(in srgb,' +
        accentColor() +
        ' 70%,#0f172a) 100%);',
    );
    header.appendChild(avatarNode(40, { name: brandName(), online: withinHours(), dotOnDark: true }));

    var titles = el('div', 'min-width:0;flex:1;');
    var title = el(
      'div',
      'font-weight:700;font-size:15px;letter-spacing:-0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
    );
    title.textContent = brandName();
    var subtitle = el(
      'div',
      'font-size:12px;opacity:.88;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
    );
    subtitle.textContent = withinHours() ? replyHint() : 'Away · leave a message';
    titles.appendChild(title);
    titles.appendChild(subtitle);

    var closeBtn = el(
      'button',
      'flex-shrink:0;width:30px;height:30px;border:0;border-radius:999px;background:rgba(255,255,255,.14);' +
        'color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;',
    );
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.innerHTML = closeIconSvg();
    closeBtn.onmouseenter = function () {
      closeBtn.style.background = 'rgba(255,255,255,.24)';
    };
    closeBtn.onmouseleave = function () {
      closeBtn.style.background = 'rgba(255,255,255,.14)';
    };
    closeBtn.onclick = function () {
      closeWidget();
    };

    header.appendChild(titles);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var messages = el(
      'div',
      'flex:1;min-height:0;overflow-y:auto;padding:18px 14px 12px;' +
        'background:linear-gradient(180deg,#f8fafc 0%,#ffffff 48%);',
    );
    messages.setAttribute('data-cp-messages', '1');
    messagesEl = messages;
    // Attach before rendering so scrollHeight is measurable.
    panel.appendChild(messages);
    renderMessages(messages);

    var footer = el(
      'div',
      'flex-shrink:0;border-top:1px solid rgba(15,23,42,.06);' +
        'background:rgba(255,255,255,.92);backdrop-filter:blur(8px);padding:12px 12px 14px;',
    );

    function fieldCss() {
      return (
        'width:100%;box-sizing:border-box;margin:0 0 8px;padding:10px 12px;border:1px solid rgba(15,23,42,.1);' +
        'border-radius:12px;font:inherit;font-size:13px;color:#0f172a;background:#fff;outline:none;'
      );
    }

    function showComposer() {
      footer.innerHTML = '';

      if (hasVisitor()) {
        var who = el(
          'div',
          'display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;',
        );
        var whoLabel = el(
          'div',
          'min-width:0;font-size:11px;font-weight:600;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
        );
        whoLabel.textContent =
          'Chatting as ' + visitor.name + (visitorContactLabel() ? ' · ' + visitorContactLabel() : '');
        var changeBtn = el(
          'button',
          'flex-shrink:0;border:0;background:transparent;color:' +
            accentColor() +
            ';font:inherit;font-size:11px;font-weight:700;cursor:pointer;padding:0;',
        );
        changeBtn.type = 'button';
        changeBtn.textContent = 'Edit';
        changeBtn.onclick = function () {
          showIdentityForm(true);
        };
        who.appendChild(whoLabel);
        who.appendChild(changeBtn);
        footer.appendChild(who);
      }

      var composer = el(
        'div',
        'display:flex;align-items:flex-end;gap:8px;border:1px solid rgba(15,23,42,.1);border-radius:16px;' +
          'padding:8px 8px 8px 14px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04);' +
          'transition:border-color .15s ease, box-shadow .15s ease;',
      );
      var input = document.createElement('textarea');
      input.rows = 1;
      input.placeholder = 'Ask me anything…';
      input.setAttribute('aria-label', 'Message');
      input.style.cssText =
        'flex:1;min-width:0;border:0;outline:none;resize:none;max-height:110px;font:inherit;font-size:14px;' +
        'line-height:1.45;color:#0f172a;background:transparent;padding:6px 0;letter-spacing:-0.01em;';

      var sendBtn = el(
        'button',
        'flex-shrink:0;width:38px;height:38px;border:0;border-radius:999px;background:' +
          accentColor() +
          ';color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;' +
          'box-shadow:0 8px 18px color-mix(in srgb,' +
          accentColor() +
          ' 35%,transparent);',
      );
      sendBtn.type = 'button';
      sendBtn.setAttribute('aria-label', 'Send message');
      sendBtn.innerHTML = sendIconSvg();

      function setSending(busy) {
        sendBtn.disabled = busy;
        input.disabled = busy;
        sendBtn.style.opacity = busy ? '0.65' : '1';
        typing = busy;
        renderMessages(messages);
      }

      function sendMessage() {
        var text = (input.value || '').trim();
        if (!text) return;
        if (!hasVisitor()) {
          showIdentityForm(false, text);
          return;
        }
        var msg = { role: 'visitor', text: text, at: Date.now(), status: 'sending' };
        thread.push(msg);
        saveThread();
        input.value = '';
        input.style.height = 'auto';
        setSending(true);
        submit('chat', { message: text })
          .then(function (data) {
            msg.status = 'sent';
            if (data && data.interaction && data.interaction.id) {
              msg.serverId = data.interaction.id;
            }
            if (!ackSent) {
              ackSent = true;
              thread.push({
                role: 'agent',
                text: withinHours()
                  ? 'Thanks ' +
                    visitor.name.split(/\s+/)[0] +
                    ' — a teammate will reply here shortly.'
                  : 'Thanks ' +
                    visitor.name.split(/\s+/)[0] +
                    ' — we will reply when we are back online.',
                at: Date.now(),
              });
            }
            saveThread();
          })
          .catch(function () {
            msg.status = 'failed';
            saveThread();
          })
          .then(function () {
            setSending(false);
            input.focus();
          });
      }

      sendBtn.onclick = sendMessage;
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(110, input.scrollHeight) + 'px';
      });
      input.addEventListener('focus', function () {
        composer.style.borderColor = accentColor();
        composer.style.boxShadow =
          '0 0 0 3px color-mix(in srgb,' + accentColor() + ' 18%,transparent)';
      });
      input.addEventListener('blur', function () {
        composer.style.borderColor = 'rgba(15,23,42,.1)';
        composer.style.boxShadow = '0 1px 2px rgba(15,23,42,.04)';
      });

      composer.appendChild(input);
      composer.appendChild(sendBtn);
      footer.appendChild(composer);
      appendWhatsAppRow(footer);
      setTimeout(function () {
        input.focus();
      }, 40);
    }

    function showIdentityForm(editing, pendingMessage) {
      footer.innerHTML = '';
      var card = el(
        'div',
        'border:1px solid rgba(15,23,42,.08);border-radius:16px;padding:12px;background:#f8fafc;',
      );
      var heading = el(
        'div',
        'font-size:13px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;margin:0 0 4px;',
      );
      heading.textContent = editing ? 'Update your details' : 'Before we chat';
      var help = el('div', 'font-size:12px;color:#64748b;line-height:1.4;margin:0 0 10px;');
      help.textContent = 'Name plus email or phone — so our team can follow up with you.';
      card.appendChild(heading);
      card.appendChild(help);

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'Your name';
      nameInput.autocomplete = 'name';
      nameInput.required = true;
      nameInput.style.cssText = fieldCss();
      nameInput.value = (visitor && visitor.name) || '';

      var emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.placeholder = 'Email';
      emailInput.autocomplete = 'email';
      emailInput.inputMode = 'email';
      emailInput.style.cssText = fieldCss();
      emailInput.value = (visitor && visitor.email) || '';

      var phoneInput = document.createElement('input');
      phoneInput.type = 'tel';
      phoneInput.placeholder = 'Phone';
      phoneInput.autocomplete = 'tel';
      phoneInput.inputMode = 'tel';
      phoneInput.style.cssText = fieldCss() + 'margin-bottom:10px;';
      phoneInput.value = (visitor && visitor.phone) || '';

      var err = el('div', 'display:none;font-size:11px;color:#b91c1c;margin:0 0 8px;');
      var startBtn = el(
        'button',
        'width:100%;border:0;border-radius:12px;padding:11px 14px;background:' +
          accentColor() +
          ';color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer;',
      );
      startBtn.type = 'button';
      startBtn.textContent = editing ? 'Save' : 'Start chat';

      function markInvalid(inputEl, on) {
        inputEl.style.borderColor = on ? '#ef4444' : 'rgba(15,23,42,.1)';
      }

      startBtn.onclick = function () {
        var name = nameInput.value.trim();
        var email = emailInput.value.trim();
        var phone = phoneInput.value.trim();
        markInvalid(nameInput, false);
        markInvalid(emailInput, false);
        markInvalid(phoneInput, false);

        if (!name) {
          err.style.display = 'block';
          err.textContent = 'Please enter your name.';
          markInvalid(nameInput, true);
          nameInput.focus();
          return;
        }
        if (!email && !phone) {
          err.style.display = 'block';
          err.textContent = 'Enter an email or a phone number (at least one).';
          markInvalid(emailInput, true);
          markInvalid(phoneInput, true);
          emailInput.focus();
          return;
        }
        if (email && !isValidEmail(email)) {
          err.style.display = 'block';
          err.textContent = 'Enter a valid email address (e.g. name@company.com).';
          markInvalid(emailInput, true);
          emailInput.focus();
          return;
        }
        if (phone && !isValidPhone(phone)) {
          err.style.display = 'block';
          err.textContent =
            'Enter a valid phone number (10 digits, or with country code like +91…).';
          markInvalid(phoneInput, true);
          phoneInput.focus();
          return;
        }

        saveVisitor({ name: name, email: email, phone: phone });
        if (!editing) {
          thread.push({
            role: 'agent',
            text: 'Thanks ' + name.split(/\s+/)[0] + ' — go ahead and send your message.',
            at: Date.now(),
          });
          saveThread();
          renderMessages(messages);
        }
        showComposer();
        if (pendingMessage && String(pendingMessage).trim()) {
          var composerInput = footer.querySelector('textarea');
          if (composerInput) {
            composerInput.value = String(pendingMessage).trim();
            composerInput.dispatchEvent(new Event('input'));
          }
        }
      };

      card.appendChild(nameInput);
      card.appendChild(emailInput);
      card.appendChild(phoneInput);
      card.appendChild(err);
      card.appendChild(startBtn);
      footer.appendChild(card);
      appendWhatsAppRow(footer);
      setTimeout(function () {
        nameInput.focus();
      }, 40);
    }

    function appendWhatsAppRow(parent) {
      if (!hasWhatsApp()) return;
      var waRow = el('div', 'display:flex;justify-content:center;margin-top:10px;');
      var waBtn = el(
        'button',
        'display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(15,23,42,.08);' +
          'background:#f8fafc;color:#334155;font:inherit;font-size:12px;font-weight:650;' +
          'cursor:pointer;padding:7px 12px;border-radius:999px;',
      );
      waBtn.type = 'button';
      waBtn.innerHTML =
        '<span style="color:#25D366;display:inline-flex;line-height:0">' +
        waIconSvg() +
        '</span><span>Continue on WhatsApp</span>';
      waBtn.onmouseenter = function () {
        waBtn.style.background = '#f0fdf4';
        waBtn.style.borderColor = 'rgba(37,211,102,.35)';
      };
      waBtn.onmouseleave = function () {
        waBtn.style.background = '#f8fafc';
        waBtn.style.borderColor = 'rgba(15,23,42,.08)';
      };
      waBtn.onclick = openWhatsApp;
      waRow.appendChild(waBtn);
      parent.appendChild(waRow);
    }

    if (hasVisitor()) showComposer();
    else showIdentityForm(false);

    panel.appendChild(footer);
    root.appendChild(panel);
    renderLauncher();
    scrollMessagesToBottom(messages);
  }

  fetch(
    apiBase +
      '/leads/widget/' +
      encodeURIComponent(orgId) +
      '/config?publicKey=' +
      encodeURIComponent(publicKey),
  )
    .then(function (r) {
      if (!r.ok) throw new Error('config');
      return r.json();
    })
    .then(function (cfg) {
      config = cfg;
      // Inbox → Chat placement is the source of truth (left/right → bottom corner).
      if (cfg.placementSide === 'left') position = 'bottom-left';
      else if (cfg.placementSide === 'right') position = 'bottom-right';
      applyRootLayout();
      startPolling();
      if (pendingOpen) openWidget();
      else renderLauncher();
    })
    .catch(function () {
      /* widget stays hidden if misconfigured */
    });
})();
