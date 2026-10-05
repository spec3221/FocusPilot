
(() => {
  if (window.__FOCUS_PILOT_DOCK__) return;
  window.__FOCUS_PILOT_DOCK__ = true;

  const root = document.createElement("div");
  root.id = "focuspilot-dock-root";
  const shadow = root.attachShadow({mode: "open"});

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .dock {
      position: fixed;
      top: 82px;
      right: 18px;
      z-index: 2147483647;
      width: 310px;
      color: #eef2ff;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: rgba(12, 17, 31, .94);
      border: 1px solid rgba(139, 116, 255, .38);
      border-radius: 18px;
      box-shadow: 0 18px 55px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.025) inset;
      backdrop-filter: blur(18px);
      overflow: hidden;
      transition: .2s ease;
    }
    .dock.collapsed { width: 52px; border-radius: 16px; }
    .dock.collapsed .body, .dock.collapsed .brand-text, .dock.collapsed .stats,
    .dock.collapsed .collapse-icon { display:none; }
    .dock.collapsed .top { justify-content:center; padding: 8px; }
    .top { display:flex; align-items:center; gap:10px; padding:10px 11px; border-bottom:1px solid rgba(255,255,255,.07); cursor:grab; user-select:none; touch-action:none; }
    .top.dragging { cursor:grabbing; }\n    .logo {
      width:31px;height:31px;border-radius:10px;display:grid;place-items:center;
      background:linear-gradient(135deg,#7c5cff,#5de1c7); color:white; font-weight:900;
      box-shadow:0 6px 20px rgba(124,92,255,.25);
    }
    .brand-text { flex:1; font-weight:800; font-size:13px; letter-spacing:.1px; }
    .brand-text small { display:block; margin-top:2px; color:#8e9ab5; font-weight:500; font-size:10px; }
    .icon-btn {
      border:0; background:transparent; color:#aeb9d0; cursor:pointer; border-radius:9px;
      width:28px;height:28px; font-size:15px;
    }
    .icon-btn:hover { background:rgba(255,255,255,.08); color:#fff; }
    .body { padding:11px; }
    .search { display:flex; gap:7px; }
    .search input {
      flex:1; min-width:0; border:1px solid rgba(255,255,255,.1); outline:none;
      background:#151d31; color:#fff; border-radius:10px; padding:10px 11px; font-size:12px;
    }
    .search input:focus { border-color:#7c5cff; box-shadow:0 0 0 3px rgba(124,92,255,.13); }
    .go {
      border:0; background:#7c5cff; color:white; border-radius:10px; padding:0 12px;
      cursor:pointer; font-weight:800;
    }
    .go:hover { filter:brightness(1.08); }
    .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; margin-top:9px; }
    .stat { background:#11192b; border:1px solid rgba(255,255,255,.06); border-radius:11px; padding:8px; }
    .stat b { display:block; font-size:15px; }
    .stat span { display:block; color:#7f8ca7; font-size:9px; margin-top:2px; }
    .actions { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-top:9px; }
    .action {
      border:1px solid rgba(255,255,255,.08); background:#121b2e; color:#dfe5f5;
      border-radius:10px; padding:9px 8px; cursor:pointer; font-size:11px; font-weight:700;
    }
    .action:hover { background:#19233a; border-color:rgba(124,92,255,.4); }
    .url { color:#66738d; font-size:9px; margin-top:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .toast {
      position:fixed; right:0; top:calc(100% + 8px); padding:8px 10px; border-radius:9px;
      background:#11192b; border:1px solid rgba(255,255,255,.1); color:#fff; font-size:11px;
      opacity:0; transform:translateY(-5px); pointer-events:none; transition:.16s;
    }
    .toast.show { opacity:1; transform:translateY(0); }
    @media (max-width: 900px) { .dock { top:72px; right:10px; } }
    @media (max-width: 650px) { .dock { width:270px; } }
  `;

  shadow.appendChild(style);

  const dock = document.createElement("div");
  dock.className = "dock";
  dock.innerHTML = `
    <div class="top">
      <div class="logo">✦</div>
      <div class="brand-text">FocusPilot<small>Web Focus Dock</small></div>
      <button class="icon-btn" id="collapse" title="Свернуть">−</button>
      <button class="icon-btn collapse-icon" id="close" title="Скрыть">×</button>
    </div>
    <div class="body">
      <div class="search">
        <input id="q" placeholder="Искать через FocusPilot..." autocomplete="off">
        <button class="go" id="go">⌕</button>
      </div>
      <div class="stats">
        <div class="stat"><b id="taskCount">—</b><span>задач</span></div>
        <div class="stat"><b id="focusMin">—</b><span>мин фокуса</span></div>
        <div class="stat"><b id="score">—</b><span>Focus Score</span></div>
      </div>
      <div class="actions">
        <button class="action" id="home">🏠 Главная</button>
        <button class="action" id="task">＋ Задача</button>
        <button class="action" id="capture">🔖 Сохранить</button>
        <button class="action" id="newtab">✦ Новая вкладка</button>
      </div>
      <div class="url" id="url"></div>
      <div class="toast" id="toast"></div>
    </div>
  `;
  shadow.appendChild(dock);
  document.documentElement.appendChild(root);

  const $ = id => shadow.getElementById(id);

  function showToast(text) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  async function loadStats() {
    try {
      const d = await chrome.storage.local.get(["tasks","focusMinutes"]);
      const tasks = Array.isArray(d.tasks) ? d.tasks : [];
      const done = tasks.filter(x => x && x.done).length;
      $("taskCount").textContent = done;
      $("focusMin").textContent = Number(d.focusMinutes) || 0;
      const score = Math.min(100, done * 10 + Math.floor((Number(d.focusMinutes)||0) * .5));
      $("score").textContent = score;
    } catch {}
  }

  function search() {
    const q = $("q").value.trim();
    if (!q) { $("q").focus(); return; }
    location.href = "https://www.google.com/search?q=" + encodeURIComponent(q);
  }

  $("go").onclick = search;
  $("q").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); search(); }
  });

  $("collapse").onclick = () => dock.classList.toggle("collapsed");
  $("close").onclick = () => root.remove();

  async function openFocusPilot() {
    try {
      const response = await chrome.runtime.sendMessage({type:"openFocusPilot"});
      if (response?.ok === false) showToast("Не удалось открыть FocusPilot");
    } catch {
      showToast("Не удалось открыть FocusPilot");
    }
  }

  $("home").onclick = openFocusPilot;
  $("newtab").onclick = openFocusPilot;

  $("task").onclick = async () => {
    const text = prompt("Новая задача:");
    if (!text || !text.trim()) return;
    try {
      const d = await chrome.storage.local.get(["tasks"]);
      const tasks = Array.isArray(d.tasks) ? d.tasks : [];
      tasks.unshift({
        id: "task_" + Date.now().toString(36),
        text: text.trim(),
        done: false,
        time: Date.now()
      });
      await chrome.storage.local.set({tasks});
      await loadStats();
      showToast("Задача сохранена ✓");
    } catch {
      showToast("Не удалось сохранить задачу");
    }
  };

  $("capture").onclick = async () => {
    try {
      const response = await chrome.runtime.sendMessage({type:"capture"});
      showToast(response?.ok === false ? "Не удалось сохранить" : "Страница сохранена ✓");
    } catch {
      showToast("Не удалось сохранить страницу");
    }
  };

  $("url").textContent = location.hostname + location.pathname;

  // --- Draggable FocusPilot Dock ---
  const topBar = shadow.querySelector(".top");
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;

  function clampPosition(left, top) {
    const rect = dock.getBoundingClientRect();
    const maxLeft = Math.max(6, window.innerWidth - rect.width - 6);
    const maxTop = Math.max(6, window.innerHeight - rect.height - 6);
    return {
      left: Math.max(6, Math.min(left, maxLeft)),
      top: Math.max(6, Math.min(top, maxTop))
    };
  }

  async function savePosition(left, top) {
    try {
      await chrome.storage.local.set({
        focusPilotDockPosition: {left, top}
      });
    } catch {}
  }

  async function restorePosition() {
    try {
      const data = await chrome.storage.local.get(["focusPilotDockPosition"]);
      const pos = data.focusPilotDockPosition;
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        const safe = clampPosition(pos.left, pos.top);
        dock.style.left = safe.left + "px";
        dock.style.top = safe.top + "px";
        dock.style.right = "auto";
      }
    } catch {}
  }

  topBar.addEventListener("pointerdown", (e) => {
    // Only the empty header area / logo / brand can start dragging.
    // Buttons keep their normal click behavior.
    if (e.target.closest("button")) return;

    const rect = dock.getBoundingClientRect();
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;

    topBar.classList.add("dragging");
    topBar.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });

  topBar.addEventListener("pointermove", (e) => {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;

    const safe = clampPosition(startLeft + dx, startTop + dy);
    dock.style.left = safe.left + "px";
    dock.style.top = safe.top + "px";
    dock.style.right = "auto";
  });

  topBar.addEventListener("pointerup", async (e) => {
    if (!dragging) return;
    dragging = false;
    topBar.classList.remove("dragging");

    const rect = dock.getBoundingClientRect();
    const safe = clampPosition(rect.left, rect.top);
    dock.style.left = safe.left + "px";
    dock.style.top = safe.top + "px";
    dock.style.right = "auto";
    await savePosition(safe.left, safe.top);

    topBar.releasePointerCapture?.(e.pointerId);
  });

  topBar.addEventListener("pointercancel", () => {
    dragging = false;
    topBar.classList.remove("dragging");
  });

  window.addEventListener("resize", () => {
    const rect = dock.getBoundingClientRect();
    const safe = clampPosition(rect.left, rect.top);
    dock.style.left = safe.left + "px";
    dock.style.top = safe.top + "px";
    dock.style.right = "auto";
  });

  restorePosition();
  loadStats();
})();
