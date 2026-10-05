window.FPUI = {
  async init() {
    await FP.patchDefaults();
    const data = await FP.get();
    document.documentElement.dataset.theme = data.theme || "dark";
    return data;
  },

  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  },

  toast(msg, kind="") {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      document.body.appendChild(el);
    }
    clearTimeout(this._toast);
    el.textContent = msg;
    el.className = "toast show " + kind;
    this._toast = setTimeout(() => {
      el.className = "toast";
      el.textContent = "";
    }, 1800);
  },

  saveStatus(text="Сохранено") {
    const el = document.getElementById("saveStatus");
    if (!el) return;
    el.textContent = "● " + text;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      el.textContent = "● Автосохранение включено";
    }, 1200);
  },

  async save(data) {
    await FP.set(data);
    this.saveStatus();
  },

  async toggleTheme() {
    const d = await FP.get(["theme"]);
    const theme = d.theme === "light" ? "dark" : "light";
    await FP.set({theme});
    document.documentElement.dataset.theme = theme;
    return theme;
  }
};