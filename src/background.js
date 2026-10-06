importScripts("storage.js");

let activeTab = null;
let activeStarted = 0;

async function init() {
  await FP.patchDefaults();
}
init();

function hostMatches(host, ruleHost) {
  return host === ruleHost || host.endsWith("." + ruleHost);
}

function blockedByRule(url, rules) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./,"");
  const path = u.pathname.replace(/\/+$/,"") || "";
  for (const r of (rules || [])) {
    if (!hostMatches(host, r.host)) continue;
    if (r.type === "domain") return r;
    if (r.type === "url" && path === r.path) return r;
  }
  return null;
}

async function checkAndBlock(tabId, url) {
  if (!url || url.startsWith(chrome.runtime.getURL(""))) return false;
  const data = await FP.get(["blocks", "settings"]);
  // Правила Digital Shield работают только при включённом режиме «Анти-отвлечение»
  if (!data.settings?.antiDistraction) return false;
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const rule = blockedByRule(url, blocks);
  if (!rule) return false;
  const target = chrome.runtime.getURL("src/blocked.html") +
    "?site=" + encodeURIComponent(new URL(url).hostname) +
    "&rule=" + encodeURIComponent(rule.type === "url" ? rule.path : "domain");
  try { await chrome.tabs.update(tabId, {url: target}); } catch {}
  return true;
}

// При включении режима сразу блокируем уже открытые вкладки
async function blockOpenTabs() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.id != null && t.url) await checkAndBlock(t.id, t.url);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  const was = !!changes.settings.oldValue?.antiDistraction;
  const now = !!changes.settings.newValue?.antiDistraction;
  if (!was && now) blockOpenTabs();
});

chrome.webNavigation.onBeforeNavigate.addListener(async details => {
  if (details.frameId !== 0) return;
  await checkAndBlock(details.tabId, details.url);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) await checkAndBlock(tabId, changeInfo.url);
});

async function recordVisit(tab) {
  if (!tab?.url || !/^https?:/.test(tab.url)) return;
  let host;
  try { host = new URL(tab.url).hostname.replace(/^www\./,""); } catch { return; }
  const {visits={}} = await FP.get(["visits"]);
  visits[host] = (visits[host] || 0) + 1;
  await FP.set({visits});
}

chrome.tabs.onActivated.addListener(async ({tabId}) => {
  if (activeTab !== null && activeStarted) {
    await addDwell(activeTab, Date.now() - activeStarted);
  }
  activeTab = tabId;
  activeStarted = Date.now();
  try {
    const tab = await chrome.tabs.get(tabId);
    await recordVisit(tab);
  } catch {}
});

chrome.tabs.onRemoved.addListener(async tabId => {
  if (tabId === activeTab && activeStarted) {
    await addDwell(tabId, Date.now() - activeStarted);
    activeTab = null;
    activeStarted = 0;
  }
});

async function addDwell(tabId, ms) {
  if (ms < 1000) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !/^https?:/.test(tab.url)) return;
    const host = new URL(tab.url).hostname.replace(/^www\./,"");
    const {dwell={}} = await FP.get(["dwell"]);
    dwell[host] = (dwell[host] || 0) + Math.round(ms / 1000);
    await FP.set({dwell});
  } catch {}
}

// Сохранение страницы в Read Later (используется и из сообщения, и из горячей клавиши)
async function capturePage(tab) {
  if (!tab || !tab.url) return {ok:false};
  const data = await FP.get(["readLater"]);
  const readLater = Array.isArray(data.readLater) ? data.readLater : [];
  if (!readLater.some(x => x.url === tab.url)) {
    readLater.unshift({id:FP.uid("read"), title:tab.title || tab.url, url:tab.url, added:Date.now()});
    await FP.set({readLater});
  }
  return {ok:true};
}


// ---------- Микшер звуков (аудио живёт в offscreen-документе) ----------
const MIXER_KEYS = ["rain", "waves", "wind", "fire", "brown", "white"];

function sanitizeMixer(m) {
  const out = { master: 0.7, levels: {} };
  const mm = Number(m?.master);
  if (Number.isFinite(mm)) out.master = Math.min(1, Math.max(0, mm));
  for (const k of MIXER_KEYS) {
    const v = Number(m?.levels?.[k]);
    out.levels[k] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  }
  return out;
}

const mixerActive = m => m.master > 0 && MIXER_KEYS.some(k => m.levels[k] > 0);

async function hasOffscreen() {
  const ctxs = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  return ctxs.length > 0;
}

let offscreenCreating = null;
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen.createDocument({
      url: "src/offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Воспроизведение фоновых звуков микшера"
    }).finally(() => { offscreenCreating = null; });
  }
  await offscreenCreating;
}

async function applyMixer(m) {
  try {
    if (mixerActive(m)) {
      await ensureOffscreen();
      chrome.runtime.sendMessage({ target: "offscreen", type: "mixerApply", state: m }).catch(() => {});
    } else if (await hasOffscreen()) {
      chrome.runtime.sendMessage({ target: "offscreen", type: "mixerApply", state: m }).catch(() => {});
      setTimeout(async () => {
        const cur = sanitizeMixer((await FP.get(["mixer"])).mixer);
        if (!mixerActive(cur) && await hasOffscreen()) chrome.offscreen.closeDocument().catch(() => {});
      }, 900);
    }
  } catch (e) {
    console.error("FocusPilot mixer error:", e);
  }
}

// После перезапуска браузера звуки не должны включаться сами
chrome.runtime.onStartup.addListener(async () => {
  const m = sanitizeMixer((await FP.get(["mixer"])).mixer);
  for (const k of MIXER_KEYS) m.levels[k] = 0;
  await FP.set({ mixer: m });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "offscreen") return false;
  (async () => {
    if (msg.type === "mixerSet") {
      const m = sanitizeMixer(msg.state);
      await FP.set({ mixer: m });
      await applyMixer(m);
      return { ok: true };
    }
    if (msg.type === "mixerReady") {
      const d = await FP.get(["mixer"]);
      return { ok: true, state: sanitizeMixer(d.mixer) };
    }
    if (msg.type === "openFocusPilot") {
      try {
        await chrome.tabs.create({url: chrome.runtime.getURL("src/newtab.html")});
        return {ok:true};
      } catch (e) {
        return {ok:false, error:String(e?.message || e)};
      }
    }
    if (msg.type === "addBlock") {
      const rule = FP.normalizeBlock(msg.value);
      if (!rule) return {ok:false, error:"Введите корректный домен или URL"};
      const data = await FP.get(["blocks"]);
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];

      const duplicate = blocks.some(r =>
        r &&
        String(r.host || "").toLowerCase() === rule.host.toLowerCase() &&
        String(r.path || "") === String(rule.path || "") &&
        String(r.type || "") === String(rule.type || "")
      );

      if (duplicate) {
        return {ok:false, error:"Такое правило уже есть"};
      }

      blocks.push(rule);
      await FP.set({blocks});
      return {ok:true, rule};
    }
    if (msg.type === "removeBlock") {
      const data = await FP.get(["blocks"]);
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      await FP.set({blocks:blocks.filter(r => r && r.id !== msg.id)});
      return {ok:true};
    }
    if (msg.type === "capture") {
      let tab = sender.tab;
      if (!tab) {
        // сообщение из popup — берём активную вкладку
        const tabs = await chrome.tabs.query({active:true, lastFocusedWindow:true});
        tab = tabs[0];
      }
      return capturePage(tab);
    }
    if (msg.type === "focusAdded") {
      const data = await FP.get(["focusMinutes","dailyHistory"]);
      const minutes = Number(msg.minutes) || 0;
      data.focusMinutes = (Number(data.focusMinutes) || 0) + minutes;
      const d = FP.today();
      data.dailyHistory = data.dailyHistory || {};
      data.dailyHistory[d] = (data.dailyHistory[d] || 0) + minutes;
      await FP.set(data);
      return {ok:true};
    }
    return {ok:false, error:"Unknown command"};
  })().then(sendResponse);
  return true;
});

chrome.commands.onCommand.addListener(async command => {
  if (command === "quick-capture") {
    const tabs = await chrome.tabs.query({active:true, currentWindow:true});
    if (tabs[0]) await capturePage(tabs[0]);
  }
  if (command === "open-command-palette") {
    const tabs = await chrome.tabs.query({active:true, currentWindow:true});
    if (tabs[0]?.id) {
      try { await chrome.tabs.update(tabs[0].id, {url: chrome.runtime.getURL("src/newtab.html?palette=1")}); } catch {}
    }
  }
});
