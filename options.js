document.addEventListener("DOMContentLoaded", async () => {
  await FPUI.init();

  document.getElementById("export").onclick = async () => {
    const d = await FP.get();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], {type: "application/json"}));
    a.download = "focuspilot-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.getElementById("import").onchange = async e => {
    try {
      const t = await e.target.files[0].text();
      await FP.set(JSON.parse(t));
      alert("Импортировано");
      location.reload();
    } catch {
      alert("Неверный JSON");
    }
  };

  document.getElementById("clear").onclick = async () => {
    if (confirm("Удалить все данные FocusPilot?")) {
      await chrome.storage.local.clear();
      await FP.patchDefaults();
      location.reload();
    }
  };
});
