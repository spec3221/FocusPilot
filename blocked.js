const p = new URLSearchParams(location.search);
document.getElementById("site").textContent = p.get("site") || "сайт";
document.getElementById("home").onclick = () => location.href = chrome.runtime.getURL("src/newtab.html");
document.getElementById("back").onclick = () => history.back();
