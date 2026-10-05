document.addEventListener("DOMContentLoaded",async()=>{
  const d=await FPUI.init();
  document.getElementById("focus").textContent=d.focusMinutes||0;
  document.getElementById("done").textContent=(Array.isArray(d.tasks)?d.tasks:[]).filter(x=>x && x.done).length;
  document.getElementById("blocks").textContent=(d.blocks||[]).length;
  document.getElementById("newtab").onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL("src/newtab.html")});
  document.getElementById("capture").onclick=async()=>{await chrome.runtime.sendMessage({type:"capture"});FPUI.toast("Сохранено");};
  document.getElementById("theme").onclick=async()=>{await FPUI.toggleTheme();};
});