(() => {
  // Prevent double injection
  if (document.getElementById('clawbot-launcher')) return;

  const SESSION_ID = crypto.randomUUID();
  const API_URL = 'http://localhost:8000/chat'; // change to prod URL before deploy

  // ─── Build DOM ───────────────────────────────────────────────

  // Launcher button
  const launcher = document.createElement('button');
  launcher.id = 'clawbot-launcher';
  launcher.innerHTML = 'C';
  launcher.title = 'CLAWBOT — Civic AI';
  document.body.appendChild(launcher);

  // Panel
  const panel = document.createElement('div');
  panel.id = 'clawbot-panel';
  panel.innerHTML = `
    <div id="clawbot-header">
      <div id="clawbot-avatar">C</div>
      <div id="clawbot-header-info">
        <div id="clawbot-title">CLAWBOT</div>
        <div id="clawbot-subtitle">Belagavi Civic Intelligence</div>
      </div>
      <div id="clawbot-status"></div>
      <button id="clawbot-opacity-toggle" title="Toggle transparency">◑</button>
      <button id="clawbot-close">✕</button>
    </div>
    <div id="clawbot-messages">
      <div class="clawbot-msg bot">
        <div class="clawbot-msg-avatar">C</div>
        <div class="clawbot-msg-bubble">
          Hi! I'm <strong>CLAWBOT</strong>, your civic assistant for Belagavi City Corporation.<br><br>
          Ask me about trade licences, property tax, permits, certificates, complaints, or your rights.
        </div>
      </div>
    </div>
    <div id="clawbot-suggestions">
      <button class="clawbot-suggestion">Trade licence apply</button>
      <button class="clawbot-suggestion">Property tax deadline</button>
      <button class="clawbot-suggestion">File a complaint</button>
      <button class="clawbot-suggestion">My citizen rights</button>
    </div>
    <div id="clawbot-input-area">
      <textarea id="clawbot-input" rows="1" placeholder="Ask anything about Belagavi services..."></textarea>
      <button id="clawbot-send" disabled>
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
    <div id="clawbot-drag-hint">DRAG TO MOVE</div>
  `;
  document.body.appendChild(panel);

  const messages = panel.querySelector('#clawbot-messages');
  const input = panel.querySelector('#clawbot-input');
  const sendBtn = panel.querySelector('#clawbot-send');
  const closeBtn = panel.querySelector('#clawbot-close');
  const header = panel.querySelector('#clawbot-header');
  const suggestions = panel.querySelectorAll('.clawbot-suggestion');

  let isOpen = false;

  function openPanel() {
    isOpen = true;
    panel.classList.add('visible');
    launcher.classList.add('open');
    launcher.innerHTML = '✕';
    setTimeout(() => input.focus(), 250);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('visible');
    launcher.classList.remove('open');
    launcher.innerHTML = 'C';
  }

  launcher.addEventListener('click', () => isOpen ? closePanel() : openPanel());
  closeBtn.addEventListener('click', closePanel);

  const opacityBtn = panel.querySelector('#clawbot-opacity-toggle');
  let isTransparent = false;
  opacityBtn.addEventListener('click', () => {
    isTransparent = !isTransparent;
    panel.classList.toggle('transparent', isTransparent);
    opacityBtn.style.color = isTransparent ? '#cc7a00' : '#888';
    opacityBtn.title = isTransparent ? 'Make opaque' : 'Make transparent';
  });

  suggestions.forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.textContent;
      sendBtn.disabled = false;
      panel.querySelector('#clawbot-suggestions').style.display = 'none';
      sendMessage();
    });
  });

  input.addEventListener('input', () => {
    sendBtn.disabled = input.value.trim() === '';
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    const suggestionsEl = panel.querySelector('#clawbot-suggestions');
    if (suggestionsEl) suggestionsEl.style.display = 'none';

    addMessage('user', text);
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    const typingEl = addTyping();

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          language: 'en',
          session_id: SESSION_ID
        })
      });

      typingEl.remove();

      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      addMessage('bot', data.answer || data.response || 'Got your message!');

    } catch (err) {
      typingEl.remove();
      addMessage('bot', '⚠️ Could not connect to CLAWBOT server. Make sure the backend is running at localhost:8000.', true);
    }

    scrollBottom();
  }

  function addMessage(role, text, isError = false) {
    const wrap = document.createElement('div');
    wrap.className = `clawbot-msg ${role}`;

    if (role === 'bot') {
      wrap.innerHTML = `
        <div class="clawbot-msg-avatar">C</div>
        <div class="clawbot-msg-bubble" ${isError ? 'style="background:rgba(255,80,80,0.1);border-color:rgba(255,80,80,0.2);color:#ff8080"' : ''}>${text}</div>
      `;
    } else {
      wrap.innerHTML = `<div class="clawbot-msg-bubble">${text}</div>`;
    }

    messages.appendChild(wrap);
    scrollBottom();
    return wrap;
  }

  function addTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'clawbot-msg bot';
    wrap.innerHTML = `
      <div class="clawbot-msg-avatar">C</div>
      <div class="clawbot-msg-bubble clawbot-typing">
        <span class="clawbot-dot"></span>
        <span class="clawbot-dot"></span>
        <span class="clawbot-dot"></span>
      </div>
    `;
    messages.appendChild(wrap);
    scrollBottom();
    return wrap;
  }

  function scrollBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  let isDragging = false;
  let dragStartX, dragStartY, panelStartX, panelStartY;

  header.addEventListener('mousedown', e => {
    if (e.target === closeBtn) return;
    isDragging = true;
    panel.classList.add('dragging');

    const rect = panel.getBoundingClientRect();
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panelStartX = rect.left;
    panelStartY = rect.top;

    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    panel.style.left = panelStartX + 'px';
    panel.style.top = panelStartY + 'px';

    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    let newLeft = panelStartX + dx;
    let newTop = panelStartY + dy;

    newLeft = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, newLeft));
    newTop = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, newTop));

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    panel.classList.remove('dragging');
  });

  header.addEventListener('touchstart', e => {
    if (e.target === closeBtn) return;
    const touch = e.touches[0];
    isDragging = true;
    panel.classList.add('dragging');

    const rect = panel.getBoundingClientRect();
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    panelStartX = rect.left;
    panelStartY = rect.top;

    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    panel.style.left = panelStartX + 'px';
    panel.style.top = panelStartY + 'px';
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragStartX;
    const dy = touch.clientY - dragStartY;

    let newLeft = panelStartX + dx;
    let newTop = panelStartY + dy;

    newLeft = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, newLeft));
    newTop = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, newTop));

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  }, { passive: true });

  document.addEventListener('touchend', () => {
    isDragging = false;
    panel.classList.remove('dragging');
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'hide') {
      launcher.classList.add('hidden');
      closePanel();
    } else if (message.action === 'show') {
      launcher.classList.remove('hidden');
    }
  });
})();
