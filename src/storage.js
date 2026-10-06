const FP = {
  defaults: {
    tasks: [],
    notes: [],
    readLater: [],
    blocks: [],
    focusMinutes: 0,
    completedToday: 0,
    dailyHistory: {},
    visits: {},
    dwell: {},
    theme: "dark",
    settings: { focusLength: 25, shortBreak: 5, antiDistraction: false },
    sessions: [],
    mission: null,
    gameScores: { snake: 0, tetris: 0 },
    pins: [],
    mixer: { master: 0.7, levels: { rain: 0, waves: 0, wind: 0, fire: 0, brown: 0, white: 0 } }
  },

  async get(keys = null) {
    return chrome.storage.local.get(keys || FP.defaults);
  },

  async set(data) {
    return chrome.storage.local.set(data);
  },

  async patchDefaults() {
    const current = await FP.get();
    const patch = {};
    for (const [k,v] of Object.entries(FP.defaults)) {
      if (current[k] === undefined) patch[k] = v;
    }
    if (Object.keys(patch).length) await FP.set(patch);
    return {...FP.defaults, ...current, ...patch};
  },

  today() {
    return new Date().toISOString().slice(0,10);
  },

  uid(prefix="id") {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8);
  },

  normalizeBlock(value) {
    let raw = String(value || "").trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) {
      raw = "https://" + raw;
    }
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase().replace(/^www\./,"");
      if (!host || !host.includes(".")) return null;
      const path = u.pathname && u.pathname !== "/" ? u.pathname.replace(/\/+$/,"") : "";
      return { id: FP.uid("block"), type: path ? "url" : "domain", host, path };
    } catch {
      return null;
    }
  }
};