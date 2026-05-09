(() => {
  // Prevent double injection
  if (document.getElementById('clawbot-launcher')) return;

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
      <button id="clawbot-opacity-toggle" title="Make transparent">◑</button>
      <button id="clawbot-close">✕</button>
    </div>
    <div id="clawbot-lang-bar"><span id="clawbot-lang-label">🌐</span><div id="clawbot-lang-pills"><button class="lang-pill active" data-lang="en-IN">EN</button><button class="lang-pill" data-lang="hi-IN">हि</button><button class="lang-pill" data-lang="kn-IN">ಕ</button><button class="lang-pill" data-lang="mr-IN">म</button><button class="lang-pill" data-lang="kok-IN">Ko</button></div></div>
    <div id="clawbot-lang-bar">
      <select id="clawbot-lang-select">
        <option value="en-IN">English</option>
        <option value="kn-IN">ಕನ್ನಡ</option>
        <option value="mr-IN">मराठी</option>
        <option value="kok-IN">Konkani</option>
      </select>
    </div>
    <div id="clawbot-messages">
      <div class="clawbot-msg bot">
        <div class="clawbot-msg-avatar">C</div>
        <div class="clawbot-msg-bubble">
          Hi! I'm <strong>CLAWBOT</strong>, your AI assistant.<br><br>
          Ask me anything — I'm here to help.
        </div>
      </div>
    </div>
    <div id="clawbot-suggestions">
      <button class="clawbot-suggestion">What can you help with?</button>
      <button class="clawbot-suggestion">Summarize this page</button>
      <button class="clawbot-suggestion">Explain this to me</button>
      <button class="clawbot-suggestion">Give me tips</button>
    </div>
    <div id="clawbot-input-area">
      <textarea id="clawbot-input" rows="1" placeholder="Message CLAWBOT…"></textarea>
      <button id="clawbot-mic" title="Speak">🎤</button>
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
      sendToCerebras(btn.textContent);
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
      if (!sendBtn.disabled) sendToCerebras(input.value.trim());
    }
  });

  const langPills = panel.querySelectorAll('.lang-pill');
  const inputBox = panel.querySelector('#clawbot-input');
  function switchLanguage(lang) { currentLang = lang; inputBox.placeholder = LANGUAGES[lang].placeholder; langPills.forEach(p => p.classList.toggle('active', p.dataset.lang === lang)); if (recognition) recognition.lang = lang; }
  langPills.forEach(pill => pill.addEventListener('click', () => switchLanguage(pill.dataset.lang)));
  const micBtn = panel.querySelector('#clawbot-mic');
  let isRecording = false;
  let recognition = null;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = currentLang;
    recognition.onstart = () => { isRecording = true; micBtn.classList.add('recording'); micBtn.textContent = '🔴'; micBtn.title = LANGUAGES[currentLang].listening; };
    recognition.onresult = (event) => { inputBox.value = event.results[0][0].transcript; };
    recognition.onend = () => { isRecording = false; micBtn.classList.remove('recording'); micBtn.textContent = '🎤'; micBtn.title = 'Speak'; const msg = inputBox.value.trim(); if (msg) { inputBox.value = ''; addMessage(msg, 'user'); sendToCerebras(msg); } };
    recognition.onerror = (event) => { isRecording = false; micBtn.classList.remove('recording'); micBtn.textContent = '🎤'; micBtn.title = 'Speak'; if (event.error === 'not-allowed') { addMessage(LANGUAGES[currentLang].micDenied, 'bot'); } else if (event.error === 'no-speech') { addMessage(LANGUAGES[currentLang].noSpeech, 'bot'); } };
    micBtn.addEventListener('click', () => { if (isRecording) { recognition.stop(); } else { try { recognition.lang = currentLang; recognition.start(); } catch(e) { isRecording = false; micBtn.classList.remove('recording'); micBtn.textContent = '🎤'; } } });
  } else { micBtn.title = 'Voice not supported'; micBtn.style.opacity = '0.4'; micBtn.style.cursor = 'not-allowed'; }
  micBtn.title = 'Speak';

  sendBtn.addEventListener('click', () => sendToCerebras(input.value.trim()));

  const CIVIC_KEYWORDS = [
    "tax", "property tax", "licence", "license", "trade licence",
    "complaint", "municipal", "corporation", "certificate",
    "application", "status", "renewal", "water bill", "electricity",
    "birth certificate", "death certificate", "permit", "noc",
    "belagavi", "bbmp", "pmc", "nmc", "ward", "councillor",
    "garbage", "sanitation", "road", "pothole", "drainage"
  ];

  function isCivicQuery(message) {
    const lower = message.toLowerCase();
    return CIVIC_KEYWORDS.some(keyword => lower.includes(keyword));
  }

  const CIVIC_SITES = [
    "https://bbmpgov.in",
    "https://www.belagavicitycouncil.gov.in",
    "https://mygov.in",
    "https://services.india.gov.in"
  ];

  async function scrapeForContext(userQuery) {
    // Pick most relevant site based on keywords
    let targetUrl = CIVIC_SITES[0]; // default

    if (userQuery.toLowerCase().includes("belagavi")) {
      targetUrl = "https://www.belagavicitycouncil.gov.in";
    } else if (userQuery.toLowerCase().includes("tax") || 
               userQuery.toLowerCase().includes("property")) {
      targetUrl = "https://bbmpgov.in";
    } else if (userQuery.toLowerCase().includes("certificate") || 
               userQuery.toLowerCase().includes("application")) {
      targetUrl = "https://services.india.gov.in";
    }

    try {
      // Jina AI API with API key for more reliable scraping
      const jinaUrl = `https://r.jina.ai/${targetUrl}`;
      const response = await fetch(jinaUrl, {
        headers: {
          "Accept": "text/plain",
          "Authorization": `Bearer jina_617c047dc36642ffaa456557af19ab032NC2nSt4KKhiLBrfnpXZhIjoMfU3`
        }
      });
      const text = await response.text();
      // Return first 2000 chars to not overflow Cerebras context
      return text.slice(0, 2000);
    } catch (err) {
      console.error("Scraping failed:", err);
      return null;
    }
  }

  const CEREBRAS_API_KEY = "csk-5r3c8f424typ5wvjwnwph9w6eh99dcwmnr6cp5r8v6edxmdd";

const LANGUAGES = {
  'en-IN': { name: 'English', placeholder: 'Ask anything...', listening: 'Listening...', noSpeech: 'No speech detected. Try again.', micDenied: 'Microphone blocked. Allow it in Chrome settings.', systemPrompt: 'You are CLAWBOT, a civic AI assistant. Reply in English only. Be clear and helpful.' },
  'hi-IN': { name: 'हिंदी', placeholder: 'कुछ भी पूछें...', listening: 'सुन रहा हूं...', noSpeech: 'कोई आवाज़ नहीं आई। फिर कोशिश करें।', micDenied: 'माइक्रोफोन ब्लॉक है। Chrome सेटिंग में अनुमति दें।', systemPrompt: 'आप CLAWBOT हैं, एक नागरिक AI सहायक। केवल हिंदी में जवाब दें।' },
  'kn-IN': { name: 'ಕನ್ನಡ', placeholder: 'ಏನಾದರೂ ಕೇಳಿ...', listening: 'ಆಲಿಸುತ್ತಿದ್ದೇನೆ...', noSpeech: 'ಮಾತು ಕೇಳಿಸಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', micDenied: 'ಮೈಕ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ.', systemPrompt: 'ನೀವು CLAWBOT, ಒಂದು ನಾಗರಿಕ AI ಸಹಾಯಕ. ಕೇವಲ ಕನ್ನಡದಲ್ಲಿ ಉತ್ತರಿಸಿ.' },
  'mr-IN': { name: 'मराठी', placeholder: 'काहीही विचारा...', listening: 'ऐकत आहे...', noSpeech: 'बोलणे ऐकू आले नाही. पुन्हा प्रयत्न करा.', micDenied: 'मायक्रोफोन ब्लॉक आहे.', systemPrompt: 'तुम्ही CLAWBOT आहात, एक नागरिक AI सहाय्यक. फक्त मराठीत उत्तर द्या.' },
  'kok-IN': { name: 'Konkani', placeholder: 'Ask in Konkani...', listening: 'Aikata...', noSpeech: 'Ulovanem aikunak na. Pun try kara.', micDenied: 'Mic blocked. Allow in Chrome settings.', systemPrompt: 'You are CLAWBOT. The user speaks Konkani. Reply in Konkani or English.' }
};
let currentLang = 'en-IN';

  async function sendToCerebras(userMessage) {
    const typingBubble = addMessage("Thinking...", "bot");

    try {
      const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CEREBRAS_API_KEY}` 
        },
        body: JSON.stringify({
          model: "llama3.1-8b",
          messages: [
            {
              role: "system",
              content: LANGUAGES[currentLang].systemPrompt
            },
            { role: "user", content: userMessage }
          ],
          max_tokens: 512,
          temperature: 0.7
        })
      });

      const data = await response.json();

      if (data.choices && data.choices[0]) {
        typingBubble.textContent = data.choices[0].message.content;
      } else {
        typingBubble.textContent = "Sorry, could not get a response. Try again.";
      }

    } catch (err) {
      typingBubble.textContent = "Connection error. Please try again.";
      console.error("Cerebras error:", err);
    }
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    const suggestionsEl = panel.querySelector('#clawbot-suggestions');
    if (suggestionsEl) suggestionsEl.style.display = 'none';

    addMessage('user', text);
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    await sendToCerebras(text);

    sendBtn.disabled = input.value.trim() === '';
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

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'hide') {
      document.getElementById('clawbot-launcher').classList.add('hidden');
      closePanel();
    }
    if (msg.action === 'show') {
      document.getElementById('clawbot-launcher').classList.remove('hidden');
    }
  });
})();