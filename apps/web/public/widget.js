/**
 * CodePoetry Conversation Widget — embeddable SDK.
 *
 * Usage:
 *   <script src="https://YOUR_APP/widget.js"
 *     data-org="ORG_ID"
 *     data-key="PUBLIC_KEY"
 *     data-api="https://YOUR_API"></script>
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var orgId = script.getAttribute('data-org') || '';
  var publicKey = script.getAttribute('data-key') || '';
  var apiBase = (script.getAttribute('data-api') || '').replace(/\/$/, '');
  if (!orgId || !publicKey || !apiBase) return;

  var root = document.createElement('div');
  root.id = 'cp-travel-widget';
  root.style.cssText =
    'position:fixed;z-index:99999;right:20px;bottom:20px;font-family:system-ui,sans-serif';
  document.body.appendChild(root);

  var open = false;
  var config = null;

  function uid() {
    return 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function btn(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText =
      'display:block;width:100%;text-align:left;padding:10px 12px;margin:0 0 6px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer;font-size:14px';
    b.onclick = onClick;
    return b;
  }

  function renderLauncher() {
    root.innerHTML = '';
    var launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.textContent = open ? 'Close' : 'Need Help?';
    launcher.style.cssText =
      'border:none;border-radius:999px;padding:12px 18px;background:' +
      ((config && config.primaryColor) || '#0f766e') +
      ';color:#fff;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18)';
    launcher.onclick = function () {
      open = !open;
      if (open) renderPanel();
      else renderLauncher();
    };
    root.appendChild(launcher);
  }

  function submit(mode, fields) {
    return fetch(apiBase + '/leads/widget/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: orgId,
        publicKey: publicKey,
        mode: mode,
        message: fields.message || null,
        contactName: fields.name || null,
        email: fields.email || null,
        phone: fields.phone || null,
        destinations: fields.destinations || null,
        idempotencyKey: uid(),
      }),
    }).then(function (r) {
      if (!r.ok) throw new Error('Send failed');
      return r.json();
    });
  }

  function formMode(mode, title) {
    root.innerHTML = '';
    var panel = document.createElement('div');
    panel.style.cssText =
      'width:320px;background:#fff;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.2);padding:16px;margin-bottom:10px';
    var h = document.createElement('div');
    h.style.cssText = 'font-weight:700;margin-bottom:8px';
    h.textContent = title;
    panel.appendChild(h);

    function field(placeholder, key) {
      var input = document.createElement(key === 'message' ? 'textarea' : 'input');
      input.placeholder = placeholder;
      input.style.cssText =
        'width:100%;box-sizing:border-box;margin:0 0 8px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;font:inherit';
      input.dataset.key = key;
      panel.appendChild(input);
      return input;
    }

    var name = field('Your name', 'name');
    var phone = field('Phone', 'phone');
    var email = field('Email', 'email');
    var dest = null;
    if (mode === 'travel_enquiry') dest = field('Destination', 'destinations');
    var message = field(mode === 'callback' ? 'When should we call?' : 'Message', 'message');

    var send = document.createElement('button');
    send.type = 'button';
    send.textContent = 'Send';
    send.style.cssText =
      'width:100%;border:none;border-radius:8px;padding:10px;background:' +
      ((config && config.primaryColor) || '#0f766e') +
      ';color:#fff;font-weight:600;cursor:pointer';
    send.onclick = function () {
      send.disabled = true;
      submit(mode, {
        name: name.value,
        phone: phone.value,
        email: email.value,
        destinations: dest ? dest.value : '',
        message: message.value,
      })
        .then(function () {
          panel.innerHTML = '<p style="margin:0;font-size:14px">Thanks — we will get back to you shortly.</p>';
          setTimeout(function () {
            open = false;
            renderLauncher();
          }, 1600);
        })
        .catch(function () {
          send.disabled = false;
          alert('Could not send. Please try again.');
        });
    };
    panel.appendChild(send);

    var back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Back';
    back.style.cssText =
      'margin-top:8px;border:none;background:transparent;color:#64748b;cursor:pointer;font-size:13px';
    back.onclick = renderPanel;
    panel.appendChild(back);

    root.appendChild(panel);
    renderLauncher();
  }

  function renderPanel() {
    root.innerHTML = '';
    var panel = document.createElement('div');
    panel.style.cssText =
      'width:300px;background:#fff;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.2);padding:16px;margin-bottom:10px';
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:4px';
    title.textContent = (config && config.brandName) || 'Need Help?';
    var sub = document.createElement('div');
    sub.style.cssText = 'font-size:13px;color:#64748b;margin-bottom:12px';
    sub.textContent = (config && config.defaultGreeting) || 'How can we help?';
    panel.appendChild(title);
    panel.appendChild(sub);
    panel.appendChild(btn('Chat', function () { formMode('chat', 'Chat with us'); }));
    panel.appendChild(btn('Call / Callback', function () { formMode('callback', 'Request a callback'); }));
    panel.appendChild(btn('Travel Enquiry', function () { formMode('travel_enquiry', 'Travel enquiry'); }));
    panel.appendChild(btn('Contact form', function () { formMode('contact', 'Contact us'); }));
    if (config && config.whatsappNumber) {
      panel.appendChild(
        btn('WhatsApp', function () {
          window.open('https://wa.me/' + String(config.whatsappNumber).replace(/\D/g, ''), '_blank');
          submit('whatsapp', { message: 'Opened WhatsApp from widget' }).catch(function () {});
        }),
      );
    }
    root.appendChild(panel);
    renderLauncher();
  }

  fetch(apiBase + '/leads/widget/' + encodeURIComponent(orgId) + '/config?publicKey=' + encodeURIComponent(publicKey))
    .then(function (r) {
      if (!r.ok) throw new Error('config');
      return r.json();
    })
    .then(function (cfg) {
      config = cfg;
      renderLauncher();
    })
    .catch(function () {
      /* widget stays hidden if misconfigured */
    });
})();
