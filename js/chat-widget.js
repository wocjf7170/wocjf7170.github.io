/*
 * 심재철 포트폴리오 · AI 이력 안내 챗봇 위젯 (embeddable, dependency-free)
 * ─────────────────────────────────────────────────────────────────────
 * 붙이는 법 (GitHub Pages 등 정적 사이트):
 *   <script>
 *     window.CHATBOT_CONFIG = { apiBase: "https://chat.example.com" }; // 백엔드 없으면 생략 → 정적 FAQ 폴백
 *   </script>
 *   <script src="/web/chat-widget.js" defer></script>
 *
 * 뷰포트에 position:fixed 로 붙으므로 바탕화면이든 포트폴리오 창이 열렸든 항상 우하단에 뜬다.
 * 백엔드(/health·/chat)가 없거나 운영 시간이 아니면 자동으로 정적 FAQ 폴백으로 동작한다.
 */
(function () {
  "use strict";
  if (window.__ragChatMounted) return;
  window.__ragChatMounted = true;

  const CONFIG = Object.assign(
    {
      apiBase: "",                    // "" ⇒ 항상 폴백. 예: "https://chat.wocjf7170.dev"
      faqUrl: "./faq.json",
      hoursLabel: "평일 10:00–18:00 KST",
      email: "wocjf7170@gmail.com",
      healthPollMs: 60000,
      maxLen: 500,
      mock: false,                    // demo용: 백엔드 없이 온라인 스트리밍 흉내
      suggestions: ["성능 개선 사례", "보육료 전산화", "보유 자격증"],
      greeting: "안녕하세요 👋 심재철님의 경력을 문서 근거로 안내해 드려요. 무엇이 궁금하세요?",
    },
    window.CHATBOT_CONFIG || {}
  );

  // ── SSE 프레임 파서 (순수 함수, 테스트 대상) ──────────────────────────
  // 서버 프레임: `data: {"t":"글자"}` | `data: {"src":"출처","ids":[...]}` | `data: [DONE]`
  function parseSSEData(payload) {
    if (payload === "[DONE]") return { done: true };
    try {
      const o = JSON.parse(payload);
      return { token: o.t, source: o.src };
    } catch (_) {
      return {};
    }
  }
  window.__ragChatParseSSE = parseSSEData; // demo self-check에서 사용

  // ── 마스코트 / 아이콘 SVG ─────────────────────────────────────────────
  const mascot = (s) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 36 36" class="mascot" aria-hidden="true">
       <defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="#3794d6"/><stop offset="1" stop-color="#0e639c"/>
       </linearGradient></defs>
       <rect x="0" y="0" width="36" height="36" rx="11" fill="url(#mg)"/>
       <rect x="17" y="4" width="2" height="4" rx="1" fill="#ffffffaa"/>
       <ellipse cx="13" cy="17" rx="3" ry="4" fill="#fff"/>
       <ellipse cx="23" cy="17" rx="3" ry="4" fill="#fff"/>
       <rect x="12" y="26" width="12" height="3" rx="1.5" fill="#ffffffcc"/>
     </svg>`;
  const ICON = {
    arrow: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    minus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    moon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  };

  const CSS = `
  :host{ all:initial; }
  *{ box-sizing:border-box; font-family:Pretendard,-apple-system,"system-ui","Segoe UI","Noto Sans KR",sans-serif; }
  .wrap{ position:fixed; right:24px; bottom:24px; z-index:2147483000; }
  /* FAB */
  .fab{ width:60px;height:60px;border-radius:30px;background:#252526;border:1.5px solid #0e639c;
    display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;
    box-shadow:0 10px 28px rgba(14,99,156,.5); transition:transform .15s ease; }
  .fab:hover{ transform:translateY(-2px); }
  .fab .dot{ position:absolute;top:1px;right:1px;width:14px;height:14px;border-radius:7px;
    background:#28c840;border:2.5px solid #252526; }
  .fab .dot.off{ background:#8a8a8a; }
  .tip{ position:absolute;right:72px;bottom:14px;white-space:nowrap;background:#252526;border:1px solid #3a3a3a;
    color:#d4d4d4;font-size:13.5px;padding:11px 15px;border-radius:14px;box-shadow:0 8px 24px #000a; }
  .tip:after{ content:"";position:absolute;right:-6px;bottom:18px;width:12px;height:12px;background:#252526;
    border-right:1px solid #3a3a3a;border-top:1px solid #3a3a3a;transform:rotate(45deg); }
  /* Panel */
  .panel{ width:384px;height:620px;max-height:calc(100vh - 48px);background:#1e1e1e;border:1px solid #3a3a3a;
    border-radius:16px;overflow:hidden;display:none;flex-direction:column;
    box-shadow:0 24px 64px #000b; }
  .open .fab,.open .tip{ display:none; }
  .open .panel{ display:flex; }
  .hd{ height:64px;flex:0 0 64px;background:#2d2d2e;border-bottom:1px solid #2a2a2a;
    display:flex;align-items:center;justify-content:space-between;padding:0 14px; }
  .hd .l{ display:flex;align-items:center;gap:10px; }
  .hd .nm{ font-size:14px;font-weight:700;color:#f5f5f5;line-height:1.2; }
  .hd .st{ display:flex;align-items:center;gap:6px;margin-top:3px;font-size:11.5px;color:#8a8a8a; }
  .hd .st i{ width:7px;height:7px;border-radius:4px;background:#28c840;display:inline-block; }
  .hd .st i.off{ background:#8a8a8a; }
  .hd .r{ display:flex;gap:2px; }
  .iconbtn{ width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;
    color:#8a8a8a;cursor:pointer;background:none;border:none; }
  .iconbtn:hover{ background:#ffffff14;color:#d4d4d4; }
  .body{ flex:1 1 auto;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:16px; }
  .divider{ text-align:center;font-size:11px;color:#8a8a8a; }
  .u{ align-self:flex-end;max-width:80%;background:#0e639c;color:#fff;padding:10px 14px;
    border-radius:16px 16px 4px 16px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word; }
  .brow{ display:flex;gap:8px;align-items:flex-end;max-width:92%; }
  .brow .mascot{ flex:0 0 auto; }
  .b{ background:#2a2a2b;color:#d4d4d4;padding:12px 14px;border-radius:16px 16px 16px 4px;
    font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word; }
  .src{ display:inline-flex;align-items:center;gap:6px;margin-top:9px;padding:5px 10px;border-radius:8px;
    background:#252526;border:1px solid #2a2a2a;color:#3794d6;font-size:11.5px; }
  .caret{ display:inline-block;width:7px;color:#3794d6;animation:blink 1s steps(1) infinite; }
  @keyframes blink{ 50%{ opacity:0; } }
  .ft{ flex:0 0 auto;border-top:1px solid #2a2a2a; }
  .sug{ display:flex;gap:8px;flex-wrap:wrap;padding:10px 14px 4px; }
  .chip{ padding:7px 13px;border-radius:20px;background:#252526;border:1px solid #3a3a3a;color:#d4d4d4;
    font-size:13px;cursor:pointer; }
  .chip:hover{ border-color:#0e639c;color:#f5f5f5; }
  .inrow{ display:flex;gap:8px;align-items:center;padding:8px 12px 12px; }
  .field{ flex:1;background:#3a3a3b;border:none;border-radius:20px;padding:11px 16px;color:#d4d4d4;
    font-size:13.5px;outline:none; }
  .field::placeholder{ color:#8a8a8a; }
  .field:disabled{ background:#141414;border:1px solid #2a2a2a;cursor:not-allowed; }
  .send{ width:40px;height:40px;border-radius:20px;background:#0e639c;color:#fff;border:none;cursor:pointer;
    display:flex;align-items:center;justify-content:center;flex:0 0 auto; }
  .send:disabled{ background:#3a3a3b;color:#8a8a8a;cursor:not-allowed; }
  .banner{ display:flex;gap:10px;align-items:flex-start;background:#2a2416;border:1px solid #4a401e;
    color:#e2b341;border-radius:10px;padding:12px 14px;font-size:12.5px;line-height:1.55; }
  .faqlabel{ font-size:12px;font-weight:700;letter-spacing:.5px;color:#8a8a8a; }
  .faq{ background:#252526;border:1px solid #2a2a2a;border-radius:10px;padding:13px 14px;cursor:pointer; }
  .faq .q{ display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13.5px;color:#d4d4d4; }
  .faq .a{ font-size:12.5px;line-height:1.55;color:#8a8a8a;margin-top:9px;display:none; }
  .faq.on .a{ display:block; }
  .faq.on .q{ color:#f5f5f5;font-weight:700; }
  .note{ align-self:center;font-size:12px;color:#e2b341;text-align:center;line-height:1.5; }
  @media (max-width:480px){
    .wrap{ right:16px;bottom:16px; }
    .panel{ position:fixed;inset:0;width:100vw;height:100dvh;max-height:none;border-radius:0;border:none; }
  }`;

  // ── DOM 마운트 ────────────────────────────────────────────────────────
  const host = document.createElement("div");
  host.id = "rag-chat-widget";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>${CSS}</style>
    <div class="wrap">
      <div class="tip">경력이 궁금하세요? 무엇이든 물어보세요 👋</div>
      <button class="fab" aria-label="AI 이력 안내 열기">${mascot(36)}<span class="dot off"></span></button>
      <section class="panel" role="dialog" aria-label="AI 이력 안내 챗봇">
        <header class="hd">
          <div class="l">${mascot(36)}
            <div><div class="nm">심재철 · AI 이력 안내</div>
              <div class="st"><i class="off"></i><span class="sttxt">연결 확인 중…</span></div></div>
          </div>
          <div class="r">
            <button class="iconbtn min" aria-label="접기">${ICON.minus}</button>
            <button class="iconbtn cls" aria-label="닫기">${ICON.x}</button>
          </div>
        </header>
        <div class="body"></div>
        <div class="ft"></div>
      </section>
    </div>`;
  (document.body || document.documentElement).appendChild(host);

  const $ = (s) => root.querySelector(s);
  const wrap = $(".wrap"), fabDot = $(".fab .dot"), stDot = $(".hd .st i"), stTxt = $(".sttxt");
  const bodyEl = $(".body"), ftEl = $(".ft");

  // ── 상태 ──────────────────────────────────────────────────────────────
  let health = null;              // {open, model_ready, hours}
  let messages = [];              // {role:'user'|'bot', text, source}
  let faq = null, streaming = false;
  const isOnline = () => CONFIG.mock || (!!CONFIG.apiBase && health && health.open && health.model_ready);
  const noBackend = () => !CONFIG.apiBase && !CONFIG.mock; // 백엔드 미연결(운영 시간 문제 아님)과 구분

  // ── /health 폴링 → 뱃지 ───────────────────────────────────────────────
  async function pollHealth() {
    if (CONFIG.mock) { health = { open: true, model_ready: true, hours: CONFIG.hoursLabel }; return applyBadge(); }
    if (!CONFIG.apiBase) { health = { open: false, model_ready: false }; return applyBadge(); }
    try {
      const r = await fetch(CONFIG.apiBase + "/health", { cache: "no-store" });
      health = await r.json();
    } catch (_) { health = { open: false, model_ready: false }; }
    applyBadge();
  }
  function applyBadge() {
    const on = isOnline();
    fabDot.classList.toggle("off", !on);
    stDot.classList.toggle("off", !on);
    stTxt.textContent = on ? "상담 가능 · " + (health.hours || CONFIG.hoursLabel)
                           : noBackend() ? "준비된 답변 안내"
                           : "운영 시간 아님 · 준비된 답변";
    if (wrap.classList.contains("open")) renderFooter(); // 열려 있으면 모드 갱신
  }

  // ── 렌더링 ────────────────────────────────────────────────────────────
  function renderMessages() {
    if (!isOnline()) return; // 폴백 모드는 body를 renderFallback이 관리
    bodyEl.innerHTML = `<div class="divider">오늘 · 실시간 상담</div>`;
    if (!messages.length)
      bodyEl.insertAdjacentHTML("beforeend",
        `<div class="brow">${mascot(36)}<div class="b">${esc(CONFIG.greeting)}</div></div>`);
    for (const m of messages) {
      if (m.role === "user") {
        bodyEl.insertAdjacentHTML("beforeend", `<div class="u">${esc(m.text)}</div>`);
      } else {
        const caret = m.streaming ? '<span class="caret">▍</span>' : "";
        const src = m.source ? `<div class="src">${ICON.doc}출처 · ${esc(m.source)}</div>` : "";
        bodyEl.insertAdjacentHTML("beforeend",
          `<div class="brow">${mascot(36)}<div class="b">${esc(m.text)}${caret}${src}</div></div>`);
      }
    }
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function renderFooter() {
    if (isOnline()) {
      ftEl.innerHTML =
        `<div class="sug">${CONFIG.suggestions.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>
         <div class="inrow">
           <input class="field" maxlength="${CONFIG.maxLen}" placeholder="메시지를 입력하세요…"/>
           <button class="send">${ICON.arrow}</button>
         </div>`;
      ftEl.querySelectorAll(".chip").forEach((c) =>
        c.addEventListener("click", () => { setInput(c.textContent); send(); }));
      const field = ftEl.querySelector(".field");
      ftEl.querySelector(".send").addEventListener("click", send);
      field.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
      if (bodyEl.querySelector(".divider") === null) renderMessages();
    } else {
      renderFallback();
      ftEl.innerHTML =
        `<div class="inrow">
           <input class="field" disabled placeholder="${noBackend() ? "아래 자주 찾는 질문에서 확인하세요" : "운영 시간(" + esc(CONFIG.hoursLabel) + ")에 열립니다"}"/>
           <button class="send" disabled>${ICON.arrow}</button>
         </div>`;
    }
  }

  async function renderFallback() {
    if (!faq) { try { faq = await (await fetch(CONFIG.faqUrl)).json(); } catch (_) { faq = []; } }
    const bannerMsg = noBackend()
      ? `실시간 상담은 준비 중이라, 지금은 미리 정리해 둔 답변으로 안내드려요. 자세한 문의는 이메일(${esc(CONFIG.email)})로 주세요.`
      : `지금은 운영 시간이 아니라 미리 준비된 답변을 보여드려요. 실시간 상담은 ${esc(CONFIG.hoursLabel)}에 가능합니다.`;
    bodyEl.innerHTML =
      `<div class="banner">${ICON.moon}<span>${bannerMsg}</span></div>
       <div class="faqlabel">자주 찾는 질문</div>` +
      faq.map((f, i) =>
        `<div class="faq" data-i="${i}"><div class="q"><span>${esc(f.label)}</span>${ICON.chev}</div>
         <div class="a">${esc(f.a)}</div></div>`).join("") +
      `<div class="note">더 궁금한 점은 이메일(${esc(CONFIG.email)})로 문의해 주세요.</div>`;
    bodyEl.querySelectorAll(".faq").forEach((el) =>
      el.addEventListener("click", () => el.classList.toggle("on")));
  }

  // ── 전송 (온라인) ─────────────────────────────────────────────────────
  function setInput(v) { const f = ftEl.querySelector(".field"); if (f) f.value = v; }
  async function send() {
    const field = ftEl.querySelector(".field");
    const text = (field?.value || "").trim();
    if (!text || streaming) return;
    if (text.length > CONFIG.maxLen) return;
    field.value = "";
    messages.push({ role: "user", text });
    const bot = { role: "bot", text: "", streaming: true, source: null };
    messages.push(bot);
    renderMessages();
    streaming = true;

    try {
      if (CONFIG.mock) { await mockStream(text, bot); }
      else { await realStream(text, bot); }
    } catch (_) {
      bot.text = "일시적으로 응답하지 못했어요. 잠시 후 다시 시도하거나 이메일(" + CONFIG.email + ")로 문의해 주세요.";
    }
    bot.streaming = false;
    streaming = false;
    renderMessages();
  }

  async function realStream(text, bot) {
    const res = await fetch(CONFIG.apiBase + "/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text }),
    });
    if (res.status === 429) { bot.text = "요청이 많아 잠시 후 다시 시도해 주세요. (분당·일일 한도)"; return; }
    if (!res.ok || !res.body) { bot.text = "지금은 응답할 수 없어요. 이메일(" + CONFIG.email + ")로 문의해 주세요."; return; }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const ev = parseSSEData(line.slice(5).trim());
        if (ev.done) return;
        if (ev.token) { bot.text += ev.token; renderMessages(); }
        if (ev.source) { bot.source = ev.source; renderMessages(); }
      }
    }
  }

  // demo용: 백엔드 없이 스트리밍/출처/"모른다"를 흉내
  function mockStream(text, bot) {
    const off = /연봉|점심|주소|전화|주민|번역|코딩\s*해|합격/.test(text);
    const answer = off
      ? "그 부분은 제 자료에 없습니다. 이메일(" + CONFIG.email + ")로 문의해 주세요."
      : "전사 PC 약 700대를 Windows 11로 전환한 경험이 있습니다. 업그레이드 가능·불가 PC를 분류하고 부서별 일정을 조율해 업무 중단 없이 완료했습니다.";
    const source = off ? null : "한솔섬유 2024.05–2025.07";
    return new Promise((resolve) => {
      let i = 0;
      const t = setInterval(() => {
        bot.text += answer[i++] || "";
        renderMessages();
        if (i >= answer.length) { clearInterval(t); if (source) bot.source = source; renderMessages(); resolve(); }
      }, 18);
    });
  }

  // ── 열기/닫기 ─────────────────────────────────────────────────────────
  function openPanel() { wrap.classList.add("open"); renderFooter(); if (isOnline()) renderMessages(); }
  function closePanel() { wrap.classList.remove("open"); }
  $(".fab").addEventListener("click", openPanel);
  $(".cls").addEventListener("click", closePanel);
  $(".min").addEventListener("click", closePanel);

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ── 시작 ──────────────────────────────────────────────────────────────
  pollHealth();
  setInterval(pollHealth, CONFIG.healthPollMs);
})();
