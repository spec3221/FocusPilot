let state, timer=null, remaining=25*60, running=false;

const $ = id => document.getElementById(id);

async function render() {
  state = await FPUI.init();
  const now = new Date();
  $("date").textContent = now.toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"});
  const hour=now.getHours();
  $("greeting").textContent = hour<6?"Доброй ночи.":hour<12?"Доброе утро.":hour<18?"Добрый день.":"Добрый вечер.";

  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  $("tasks").innerHTML = tasks.length ? tasks.map(t => `
    <div class="item ${t.done?'done':''}">
      <input type="checkbox" data-task="${t.id}" ${t.done?'checked':''} style="width:auto">
      <div class="grow">${FPUI.esc(t.text)}</div>
      <button class="btn danger small" data-del-task="${t.id}">Удалить</button>
    </div>`).join("") : `<div class="empty">Пока пусто. Добавь первую задачу.</div>`;

  const notes=(Array.isArray(state.notes) ? state.notes : []).slice(0,4);
  $("notes").innerHTML=notes.length ? notes.map(n=>`<div class="item"><div class="grow">${FPUI.esc(n.text)}<div class="muted small">${new Date(n.time).toLocaleString("ru-RU")}</div></div><button class="btn danger small" data-del-note="${n.id}">×</button></div>`).join(""):`<div class="empty">Заметок пока нет.</div>`;

  const blockRules = Array.isArray(state.blocks) ? state.blocks.filter(Boolean) : [];
  $("blocks").innerHTML=blockRules.length ? blockRules.map(r=>`<span class="chip">${FPUI.esc(r.type==="domain"?r.host:r.host+r.path)}<button data-del-block="${r.id}">×</button></span>`).join(""):`<span class="muted small">Нет блокировок.</span>`;

  const reads=(Array.isArray(state.readLater) ? state.readLater : []).slice(0,5);
  $("reads").innerHTML=reads.length ? reads.map(r=>`<div class="item"><div class="grow"><a href="${FPUI.esc(r.url)}" target="_blank">${FPUI.esc(r.title)}</a></div><button class="btn danger small" data-del-read="${r.id}">×</button></div>`).join(""):`<div class="empty">Список пуст.</div>`;

  $("done").textContent=tasks.filter(x=>x.done).length;
  $("focusMin").textContent=state.focusMinutes||0;
  $("visits").textContent=Object.values(state.visits||{}).reduce((a,b)=>a+b,0);

  const hist=state.dailyHistory||{}, vals=Object.values(hist);
  $("heat").innerHTML=Array.from({length:42},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-(41-i)); const k=d.toISOString().slice(0,10);
    const v=hist[k]||0; const level=v>=100?4:v>=50?3:v>=25?2:v>0?1:0;
    return `<span class="cell" data-v="${level}" title="${k}: ${v} мин"></span>`;
  }).join("");

  renderPins();
  bindDynamic();
  renderScore();
  renderMission();
  const settings=(state.settings||{});
  $("antiDistraction").textContent=settings.antiDistraction?"🛡️ Анти-отвлечение включено":"Включить режим";
}

function bindDynamic(){
  document.querySelectorAll("[data-task]").forEach(el=>el.onclick=async()=>{
    const d=await FP.get(["tasks"]);
    const tasks=Array.isArray(d.tasks) ? d.tasks : [];
    const t=tasks.find(x=>x && x.id===el.dataset.task);
    if(t){t.done=el.checked; await FPUI.save({tasks}); await render();}
  });
  document.querySelectorAll("[data-del-task]").forEach(el=>el.onclick=async()=>{
    const d=await FP.get(["tasks"]); await FP.set({tasks:d.tasks.filter(x=>x.id!==el.dataset.delTask)}); render();
  });
  document.querySelectorAll("[data-del-note]").forEach(el=>el.onclick=async()=>{
    const d=await FP.get(["notes"]); const notes=Array.isArray(d.notes)?d.notes:[]; await FPUI.save({notes:notes.filter(x=>x && x.id!==el.dataset.delNote)}); await render();
  });
  document.querySelectorAll("[data-del-read]").forEach(el=>el.onclick=async()=>{
    const d=await FP.get(["readLater"]); const reads=Array.isArray(d.readLater)?d.readLater:[]; await FPUI.save({readLater:reads.filter(x=>x && x.id!==el.dataset.delRead)}); await render();
  });
  document.querySelectorAll("[data-del-block]").forEach(el=>el.onclick=async()=>{
    await chrome.runtime.sendMessage({type:"removeBlock",id:el.dataset.delBlock}); render();
  });
}

async function addTask(){
  const input = $("taskInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  try {
    const d = await FP.get(["tasks"]);
    const tasks = Array.isArray(d.tasks) ? d.tasks : [];

    tasks.unshift({
      id: FP.uid("task"),
      text: text,
      done: false,
      time: Date.now()
    });

    await FP.set({ tasks });
    input.value = "";
    await render();
    FPUI.toast("Задача добавлена");
  } catch (error) {
    console.error("FocusPilot addTask error:", error);
    FPUI.toast("Не удалось добавить задачу", "error");
  }
}
async function addBlock(){
  const input=$("blockInput"), value=input.value.trim(); if(!value)return;
  let r;
  try {
    r = await chrome.runtime.sendMessage({type:"addBlock",value});
  } catch (error) {
    console.error("FocusPilot addBlock error:", error);
    FPUI.toast("Не удалось связаться с блокировщиком","error");
    return;
  }
  if(!r?.ok){FPUI.toast(r?.error||"Не удалось добавить","error");return;}
  input.value=""; FPUI.toast("Блокировка добавлена"); render();
}
async function saveNote(){
  const input=$("noteInput"), text=input.value.trim();
  if(!text){ FPUI.toast("Введите текст заметки","error"); return; }
  try {
    const d=await FP.get(["notes"]);
    const notes=Array.isArray(d.notes)?d.notes:[];
    notes.unshift({id:FP.uid("note"),text,time:Date.now()});
    await FPUI.save({notes});
    input.value="";
    await render();
    FPUI.toast("Заметка сохранена");
  } catch (error) {
    console.error("FocusPilot saveNote error:", error);
    FPUI.toast("Не удалось сохранить заметку","error");
  }
}
async function capture(){
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});
  const tab=tabs[0];
  if(!tab?.url || !/^https?:/i.test(tab.url)){
    FPUI.toast("Страница браузера не может быть сохранена","error");
    return;
  }
  const result=await chrome.runtime.sendMessage({type:"capture"});
  if(result?.ok){ FPUI.toast("Сохранено в Read Later"); render(); }
  else FPUI.toast("Не удалось сохранить страницу","error");
}

function updateTimer(){
  const m=String(Math.floor(remaining/60)).padStart(2,"0"), s=String(remaining%60).padStart(2,"0");
  $("time").textContent=`${m}:${s}`;
  $("timerProgress").style.width=(100-(remaining/(25*60))*100)+"%";
  $("start").textContent=running?"Пауза":"Старт";
}
function toggleTimer(){
  if(running){clearInterval(timer);running=false;updateTimer();return;}
  running=true;updateTimer();
  timer=setInterval(async()=>{
    remaining--; updateTimer();
    if(remaining<=0){
      clearInterval(timer); running=false; remaining=25*60;
      await chrome.runtime.sendMessage({type:"focusAdded",minutes:25});
      FPUI.toast("Фокус-сессия завершена ✦"); render();
    }
  },1000);
}
function resetTimer(){clearInterval(timer);running=false;remaining=25*60;updateTimer();}



function getSearchUrl(engine, query){
  const q = encodeURIComponent(query.trim());
  const urls = {
    web: "https://www.google.com/search?q=" + q,
    google: "https://www.google.com/search?q=" + q,
    duckduckgo: "https://duckduckgo.com/?q=" + q,
    wikipedia: "https://ru.wikipedia.org/w/index.php?search=" + q,
    youtube: "https://www.youtube.com/results?search_query=" + q,
    github: "https://github.com/search?q=" + q
  };
  return urls[engine] || urls.web;
}

function doSearch(){
  const input = $("searchInput");
  const engine = $("searchEngine");
  if (!input || !engine) return;
  const query = input.value.trim();
  if (!query) {
    input.focus();
    return;
  }
  const url = getSearchUrl(engine.value, query);
  window.location.href = url;
}

function setupSearch(){
  const input = $("searchInput");
  const engine = $("searchEngine");
  const button = $("searchButton");
  const picker = $("searchPicker");
  const pickerButton = $("searchPickerButton");
  const menu = $("searchPickerMenu");
  if (!input || !engine || !button || !picker || !pickerButton || !menu) return;

  const configs = {
    web:{icon:"🌐",label:"Веб",placeholder:"Поиск в интернете..."},
    google:{icon:"🔎",label:"Google",placeholder:"Поиск в Google..."},
    duckduckgo:{icon:"🦆",label:"DuckDuckGo",placeholder:"Поиск в DuckDuckGo..."},
    wikipedia:{icon:"📚",label:"Wikipedia",placeholder:"Поиск по Википедии..."},
    youtube:{icon:"▶️",label:"YouTube",placeholder:"Поиск на YouTube..."},
    github:{icon:"💻",label:"GitHub",placeholder:"Поиск проектов на GitHub..."}
  };

  function chooseEngine(value, close=true){
    const cfg=configs[value]||configs.web;
    engine.value=value;
    $("searchPickerIcon").textContent=cfg.icon;
    $("searchPickerLabel").textContent=cfg.label;
    input.placeholder=cfg.placeholder;
    menu.querySelectorAll(".search-option").forEach(opt=>{
      opt.classList.toggle("active",opt.dataset.engine===value);
      opt.setAttribute("aria-selected",opt.dataset.engine===value?"true":"false");
    });
    localStorage.setItem("focuspilot-search-engine",value);
    if(close){
      picker.classList.remove("open");
      pickerButton.setAttribute("aria-expanded","false");
    }
  }

  const saved=localStorage.getItem("focuspilot-search-engine");
  chooseEngine(configs[saved]?saved:"web",false);

  pickerButton.onclick=(e)=>{
    e.stopPropagation();
    const open=!picker.classList.contains("open");
    picker.classList.toggle("open",open);
    pickerButton.setAttribute("aria-expanded",open?"true":"false");
  };

  menu.querySelectorAll(".search-option").forEach(opt=>{
    opt.onclick=(e)=>{
      e.stopPropagation();
      chooseEngine(opt.dataset.engine,true);
      input.focus();
    };
  });

  document.addEventListener("click",e=>{
    if(!picker.contains(e.target)){
      picker.classList.remove("open");
      pickerButton.setAttribute("aria-expanded","false");
    }
  });

  document.addEventListener("keydown",e=>{
    if(e.key==="Escape" && picker.classList.contains("open")){
      picker.classList.remove("open");
      pickerButton.setAttribute("aria-expanded","false");
      return;
    }
    if(e.ctrlKey && e.key.toLowerCase()==="k"){
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  button.onclick=doSearch;
  input.addEventListener("keydown",e=>{
    if(e.key==="Enter"){
      e.preventDefault();
      doSearch();
    }
  });
}

function getScore(data){
  const tasks=Array.isArray(data.tasks) ? data.tasks : [];
  const done=tasks.filter(x=>x.done).length;
  const focus=Number(data.focusMinutes||0);
  const visits=Object.values(data.visits||{}).reduce((a,b)=>a+b,0);
  const blocked=(data.blocks||[]).length;
  let score=Math.min(100, done*10 + Math.min(50, focus) + Math.max(0, 20-Math.min(20,visits)) + Math.min(10,blocked*2));
  return Math.round(score);
}

function renderScore(){
  const score=getScore(state);
  $("score").textContent=score;
  $("scoreRing").style.setProperty("--score", `${score*3.6}deg`);
  const title=score>=80?"🔥 Максимальный фокус":score>=55?"⚡ Хороший темп":score>=25?"🚀 Разгоняемся":"🎯 Начни с малого";
  $("scoreTitle").textContent=title;
  $("scoreText").textContent=`${score}/100 · задачи + фокус + контроль отвлечений`;
}


function missionCatalog(){
  return [
    {id:"tasks3", title:"Три шага вперёд", text:"Заверши 3 задачи сегодня.", type:"tasks", target:3},
    {id:"tasks5", title:"Разгрузи голову", text:"Заверши 5 задач сегодня.", type:"tasks", target:5},
    {id:"focus25", title:"Глубокий фокус", text:"Набери 25 минут Pomodoro сегодня.", type:"focus", target:25},
    {id:"focus50", title:"Режим потока", text:"Набери 50 минут фокуса сегодня.", type:"focus", target:50},
    {id:"read1", title:"Не потеряй идею", text:"Сохрани 1 страницу в Read Later.", type:"reads", target:1},
    {id:"read3", title:"Собери материалы", text:"Сохрани 3 страницы в Read Later.", type:"reads", target:3},
    {id:"block1", title:"Победи отвлечение", text:"Добавь хотя бы 1 правило в Digital Shield.", type:"blocks", target:1},
    {id:"block3", title:"Жёсткий фокус", text:"Добавь 3 правила в Digital Shield.", type:"blocks", target:3},
    {id:"mixed", title:"Продуктивный комбо", text:"Заверши 2 задачи и набери 25 минут фокуса.", type:"mixed", target:2},
    {id:"score50", title:"Разгони Focus Score", text:"Подними Focus Score до 50.", type:"score", target:50}
  ];
}

async function ensureMission(){
  const d=await FP.get(["mission"]);
  const today=FP.today();
  if(d.mission?.date===today) return d.mission;

  const list=missionCatalog();
  const index=(new Date().getDate()+new Date().getMonth()*7)%list.length;
  const m=list[index];
  const mission={...m,date:today,done:false};
  await FP.set({mission});
  return mission;
}

async function missionProgress(m){
  const d=await FP.get(["tasks","focusMinutes","readLater","blocks","visits"]);
  const tasks=Array.isArray(d.tasks)?d.tasks:[];
  const reads=Array.isArray(d.readLater)?d.readLater:[];
  const blocks=Array.isArray(d.blocks)?d.blocks:[];
  const doneTasks=tasks.filter(x=>x && x.done).length;
  const focus=Number(d.focusMinutes)||0;

  if(m.type==="tasks"){
    const current=Math.min(m.target,doneTasks);
    return {current,target:m.target,complete:doneTasks>=m.target,label:`${Math.min(doneTasks,m.target)}/${m.target} задач`};
  }

  if(m.type==="focus"){
    const current=Math.min(m.target,focus);
    return {current,target:m.target,complete:focus>=m.target,label:`${Math.min(focus,m.target)}/${m.target} минут`};
  }

  if(m.type==="reads"){
    const current=Math.min(m.target,reads.length);
    return {current,target:m.target,complete:reads.length>=m.target,label:`${Math.min(reads.length,m.target)}/${m.target} страниц`};
  }

  if(m.type==="blocks"){
    const current=Math.min(m.target,blocks.length);
    return {current,target:m.target,complete:blocks.length>=m.target,label:`${Math.min(blocks.length,m.target)}/${m.target} правил`};
  }

  if(m.type==="mixed"){
    // BOTH conditions are mandatory.
    const taskDone=doneTasks>=2;
    const focusDone=focus>=25;
    const conditions=(taskDone?1:0)+(focusDone?1:0);
    return {
      current:conditions,
      target:2,
      complete:taskDone && focusDone,
      label:`${conditions}/2 условий · задачи ${Math.min(doneTasks,2)}/2 · фокус ${Math.min(focus,25)}/25 мин`,
      details:{taskDone,focusDone,doneTasks,focus}
    };
  }

  if(m.type==="score"){
    const current=Math.min(m.target,getScore(d));
    return {current,target:m.target,complete:getScore(d)>=m.target,label:`${current}/${m.target} Score`};
  }

  return {current:0,target:m.target||1,complete:false,label:"0"};
}

async function renderMission(){
  const m=await ensureMission();
  const result=await missionProgress(m);
  const d=await FP.get(["mission"]);

  // Never trust a manually/incorrectly persisted "done" flag.
  // The real conditions are the source of truth.
  if(result.complete && !d.mission.done){
    d.mission.done=true;
    await FP.set({mission:d.mission});
  } else if(!result.complete && d.mission.done){
    d.mission.done=false;
    await FP.set({mission:d.mission});
  }

  const complete=result.complete;
  $("missionTitle").textContent=complete?"🏆 Миссия выполнена!":m.title;

  if(m.type==="mixed"){
    const taskMark=result.details.taskDone?"✓":"○";
    const focusMark=result.details.focusDone?"✓":"○";
    $("missionText").textContent=complete
      ? `✓ Задачи 2/2 · ✓ Фокус 25/25 мин — все условия выполнены.`
      : `${m.text} ${taskMark} Задачи ${Math.min(result.details.doneTasks,2)}/2 · ${focusMark} Фокус ${Math.min(result.details.focus,25)}/25 мин.`;
  } else {
    $("missionText").textContent=complete
      ? `${m.text} Все условия выполнены — ${result.label}.`
      : `${m.text} Прогресс: ${result.label}.`;
  }

  $("missionAction").disabled=true;
  $("missionAction").textContent=complete
    ?"✓ Выполнено автоматически"
    :"Прогресс считается автоматически — кнопку нажимать не нужно";

  const percent=Math.min(100,Math.round(result.current/result.target*100));
  let bar=$("missionProgress");
  if(!bar){
    bar=document.createElement("div");
    bar.id="missionProgress";
    bar.className="progress";
    $("missionText").after(bar);
  }
  bar.innerHTML=`<i style="width:${percent}%"></i>`;
}

async function saveTabSession(){
  const tabs=await chrome.tabs.query({currentWindow:true});
  const urls=tabs.filter(t=>t.url && /^https?:/.test(t.url)).map(t=>({url:t.url,title:t.title||t.url}));
  if(!urls.length){FPUI.toast("Нет обычных вкладок для сохранения","error");return;}
  const d=await FP.get(["sessions"]);
  const sessions=Array.isArray(d.sessions)?d.sessions:[];
  sessions.unshift({id:FP.uid("session"),name:"Сессия "+new Date().toLocaleString("ru-RU"),tabs:urls,time:Date.now()});
  await FPUI.save({sessions:sessions.slice(0,10)});
  FPUI.toast(`Сохранено вкладок: ${urls.length}`);
}

async function restoreLastSession(){
  const d=await FP.get(["sessions"]);
  const s=d.sessions?.[0];
  if(!s?.tabs?.length){FPUI.toast("Сохранённых сессий нет","error");return;}
  for(const tab of s.tabs) await chrome.tabs.create({url:tab.url,active:false});
  FPUI.toast(`Восстановлено вкладок: ${s.tabs.length}`);
}

async function toggleAntiDistraction(){
  const d=await FP.get(["settings"]);
  const settings={...(d.settings||{})};
  settings.antiDistraction=!settings.antiDistraction;
  await FPUI.save({settings});
  $("antiDistraction").textContent=settings.antiDistraction?"🛡️ Анти-отвлечение включено":"Включить режим";
  FPUI.toast(settings.antiDistraction?"Анти-отвлечение включено":"Анти-отвлечение выключено");
}

function openPalette(){
  $("paletteModal").classList.add("open"); $("cmdInput").focus();
  const cmds=[
    ["Добавить задачу","task"],["Сохранить текущую страницу","capture"],["Запустить Pomodoro","timer"],["Переключить тему","theme"]
  ];
  $("commands").innerHTML=cmds.map(x=>`<div class="cmd" data-cmd="${x[1]}">${x[0]}</div>`).join("");
  document.querySelectorAll("[data-cmd]").forEach(el=>el.onclick=()=>runCommand(el.dataset.cmd));
}
function closePalette(){ $("paletteModal").classList.remove("open"); }
async function runCommand(c){
  closePalette();
  if(c==="task"){$("taskInput").focus();}
  if(c==="capture")capture();
  if(c==="timer")toggleTimer();
  if(c==="theme"){await FPUI.toggleTheme();}
}


function setupNavigation(){
  const dashboard=$("dashboardView"), games=$("gamesView");
  $("tabDashboard").onclick=()=>{dashboard.classList.add("active");games.classList.remove("active");$("tabDashboard").classList.add("active");$("tabGames").classList.remove("active");};
  $("tabGames").onclick=()=>{dashboard.classList.remove("active");games.classList.add("active");$("tabDashboard").classList.remove("active");$("tabGames").classList.add("active");};
  $("backDashboard").onclick=()=>$("tabDashboard").click();
  document.querySelectorAll(".game-tab").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll(".game-tab").forEach(x=>{
      x.classList.remove("active","primary");
    });
    btn.classList.add("active");
    $("snakePanel").classList.toggle("hidden",btn.dataset.game!=="snake");
    $("tetrisPanel").classList.toggle("hidden",btn.dataset.game!=="tetris");
  });
}

let snake={timer:null,running:false,paused:false,score:0,dir:{x:1,y:0},next:{x:1,y:0},body:[],food:{x:10,y:10}};
const SGRID=21, SCELL=20;

async function initSnake(){
  const d=await FP.get(["gameScores"]);
  $("snakeBest").textContent=d.gameScores?.snake||0;
  $("snakeScore").textContent="0";
}
function snakeReset(){
  clearInterval(snake.timer);
  snake.score=0; snake.running=false; snake.paused=false;
  snake.dir={x:1,y:0}; snake.next={x:1,y:0};
  snake.body=[{x:8,y:10},{x:7,y:10},{x:6,y:10}];
  snake.food=randomFood();
  $("snakeScore").textContent="0";
  drawSnake();
}
function randomFood(){
  let f;
  do {f={x:Math.floor(Math.random()*SGRID),y:Math.floor(Math.random()*SGRID)}} while(snake.body.some(p=>p.x===f.x&&p.y===f.y));
  return f;
}
function drawSnake(){
  const c=$("snakeCanvas"),ctx=c.getContext("2d");
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle="#070b14";ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle="#111b2d";
  for(let i=0;i<=SGRID;i++){ctx.beginPath();ctx.moveTo(i*SCELL,0);ctx.lineTo(i*SCELL,SGRID*SCELL);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*SCELL);ctx.lineTo(SGRID*SCELL,i*SCELL);ctx.stroke();}
  ctx.fillStyle="#ff647c";ctx.fillRect(snake.food.x*SCELL+3,snake.food.y*SCELL+3,SCELL-6,SCELL-6);
  snake.body.forEach((p,i)=>{ctx.fillStyle=i===0?"#7c5cff":"#5de1c7";ctx.fillRect(p.x*SCELL+2,p.y*SCELL+2,SCELL-4,SCELL-4)});
}
async function snakeEnd(){
  clearInterval(snake.timer);snake.running=false;
  const d=await FP.get(["gameScores"]);const scores={...(d.gameScores||{})};
  if(snake.score>(scores.snake||0)){scores.snake=snake.score;await FP.set({gameScores:scores});$("snakeBest").textContent=snake.score;}
  FPUI.toast(`Змейка: ${snake.score} очков`);
}
function snakeTick(){
  if(!snake.running||snake.paused)return;
  snake.dir=snake.next;
  const head={x:snake.body[0].x+snake.dir.x,y:snake.body[0].y+snake.dir.y};
  if(head.x<0||head.y<0||head.x>=SGRID||head.y>=SGRID||snake.body.some(p=>p.x===head.x&&p.y===head.y)){snakeEnd();return;}
  snake.body.unshift(head);
  if(head.x===snake.food.x&&head.y===snake.food.y){snake.score+=10;$("snakeScore").textContent=snake.score;snake.food=randomFood();}
  else snake.body.pop();
  drawSnake();
}
function startSnake(){
  snakeReset();snake.running=true;
  snake.timer=setInterval(snakeTick,105);
}
function setupSnake(){
  snakeReset();
  $("snakeStart").onclick=startSnake;
  $("snakePause").onclick=()=>{if(snake.running){snake.paused=!snake.paused;$("snakePause").textContent=snake.paused?"Продолжить":"Пауза";}};
  window.addEventListener("keydown",e=>{
    const map={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},w:{x:0,y:-1},s:{x:0,y:1},a:{x:-1,y:0},d:{x:1,y:0}};
    const n=map[e.key];
    if(!n)return;
    if(n.x===-snake.dir.x&&n.y===-snake.dir.y)return;
    snake.next=n;
    if($("gamesView").classList.contains("active"))e.preventDefault();
  });
}

const TCOLS=10,TROWS=20,TSIZE=30;
const TPIECES=[
  [[1,1,1,1]],
  [[1,1],[1,1]],
  [[0,1,0],[1,1,1]],
  [[1,0,0],[1,1,1]],
  [[0,0,1],[1,1,1]],
  [[1,1,0],[0,1,1]],
  [[0,1,1],[1,1,0]]
];
let tet={board:[],piece:null,x:3,y:0,score:0,timer:null,running:false,paused:false};

function tNewBoard(){return Array.from({length:TROWS},()=>Array(TCOLS).fill(0));}
function tRotate(a){return a[0].map((_,i)=>a.map(r=>r[i]).reverse());}
function tSpawn(){tet.piece=JSON.parse(JSON.stringify(TPIECES[Math.floor(Math.random()*TPIECES.length)]));tet.x=3;tet.y=0;if(tCollision())tEnd();}
function tCollision(px=tet.x,py=tet.y,shape=tet.piece){
  return shape.some((row,y)=>row.some((v,x)=>v&&(px+x<0||px+x>=TCOLS||py+y>=TROWS||(py+y>=0&&tet.board[py+y][px+x]))));
}
function tMerge(){tet.piece.forEach((r,y)=>r.forEach((v,x)=>{if(v&&tet.y+y>=0)tet.board[tet.y+y][tet.x+x]=1;}));}
function tClear(){
  let lines=0;tet.board=tet.board.filter(r=>{if(r.every(Boolean)){lines++;return false;}return true;});
  while(tet.board.length<TROWS)tet.board.unshift(Array(TCOLS).fill(0));
  if(lines){tet.score += [0,100,300,500,800][lines];$("tetrisScore").textContent=tet.score;}
}
function drawTetris(){
  const c=$("tetrisCanvas"),ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle="#070b14";ctx.fillRect(0,0,c.width,c.height);
  for(let y=0;y<TROWS;y++)for(let x=0;x<TCOLS;x++)if(tet.board[y][x]){ctx.fillStyle="#7c5cff";ctx.fillRect(x*TSIZE+2,y*TSIZE+2,TSIZE-4,TSIZE-4);}
  if(tet.piece)tet.piece.forEach((r,y)=>r.forEach((v,x)=>{if(v){ctx.fillStyle="#5de1c7";ctx.fillRect((tet.x+x)*TSIZE+2,(tet.y+y)*TSIZE+2,TSIZE-4,TSIZE-4);}}));
}
function tDrop(){
  if(!tet.running||tet.paused)return;
  if(!tCollision(tet.x,tet.y+1)){tet.y++;}
  else{tMerge();tClear();tSpawn();}
  drawTetris();
}
async function tEnd(){
  clearInterval(tet.timer);tet.running=false;
  const d=await FP.get(["gameScores"]);const scores={...(d.gameScores||{})};
  if(tet.score>(scores.tetris||0)){scores.tetris=tet.score;await FP.set({gameScores:scores});$("tetrisBest").textContent=tet.score;}
  FPUI.toast(`Тетрис: ${tet.score} очков`);
}
function startTetris(){
  clearInterval(tet.timer);tet.board=tNewBoard();tet.score=0;tet.running=true;tet.paused=false;
  $("tetrisScore").textContent="0";$("tetrisPause").textContent="Пауза";tSpawn();drawTetris();
  tet.timer=setInterval(tDrop,550);
}
function setupTetris(){
  const d=FP.get(["gameScores"]).then(d=>{$("tetrisBest").textContent=d.gameScores?.tetris||0;});
  $("tetrisStart").onclick=startTetris;
  $("tetrisPause").onclick=()=>{if(tet.running){tet.paused=!tet.paused;$("tetrisPause").textContent=tet.paused?"Продолжить":"Пауза";}};
  window.addEventListener("keydown",e=>{
    if(!tet.running||tet.paused||!$("gamesView").classList.contains("active"))return;
    if(e.key==="ArrowLeft"&&!tCollision(tet.x-1,tet.y))tet.x--;
    if(e.key==="ArrowRight"&&!tCollision(tet.x+1,tet.y))tet.x++;
    if(e.key==="ArrowDown")tDrop();
    if(e.key==="ArrowUp"){const r=tRotate(tet.piece);if(!tCollision(tet.x,tet.y,r))tet.piece=r;}
    if(["ArrowLeft","ArrowRight","ArrowDown","ArrowUp"].includes(e.key))e.preventDefault();
    drawTetris();
  });
  tet.board=tNewBoard();drawTetris();
}

document.addEventListener("DOMContentLoaded", async()=>{
  try {
    await FP.patchDefaults();
    FPUI.saveStatus("Готово");
  } catch (error) {
    console.error("FocusPilot initialization error:", error);
    document.body.insertAdjacentHTML("afterbegin",
      '<div style="position:fixed;top:0;left:0;right:0;padding:12px;background:#b42318;color:#fff;z-index:9999;text-align:center">FocusPilot не смог инициализироваться. Открой консоль расширения для подробностей.</div>');
    return;
  }

  const safe = (name, fn) => { try { const r = fn(); if (r && r.catch) r.catch(e => console.error("FocusPilot " + name + " error:", e)); } catch (e) { console.error("FocusPilot " + name + " error:", e); } };
  safe("setupSearch", setupSearch);
  safe("setupNavigation", setupNavigation);
  safe("setupPins", setupPins);
  safe("setupMixer", setupMixer);
  safe("setupSnake", setupSnake);
  safe("setupTetris", setupTetris);
  safe("initSnake", initSnake);
  $("addTask").onclick=addTask; $("taskInput").addEventListener("keydown",e=>{if(e.key==="Enter")addTask()});
  $("addBlock").onclick=addBlock; $("blockInput").addEventListener("keydown",e=>{if(e.key==="Enter")addBlock()});
  $("saveNote").onclick=saveNote; $("capture").onclick=capture;
  $("noteInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();saveNote();}});
  $("start").onclick=toggleTimer; $("reset").onclick=resetTimer;
  $("theme").onclick=async()=>{await FPUI.toggleTheme();};
  $("palette").onclick=openPalette;
  $("saveSession").onclick=saveTabSession;
  $("restoreSession").onclick=restoreLastSession;
  $("antiDistraction").onclick=toggleAntiDistraction;
  $("paletteModal").onclick=e=>{if(e.target.id==="paletteModal")closePalette();};
  $("cmdInput").addEventListener("keydown",e=>{if(e.key==="Escape")closePalette();});
  document.addEventListener("keydown",e=>{if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==="p"){e.preventDefault();openPalette();}});
  render(); updateTimer();
  if(new URLSearchParams(location.search).get("palette")==="1") setTimeout(openPalette,150);
});

/* ---------- Закреплённые сайты ---------- */
const MAX_PINS = 24;

function pinIcon(url){
  return chrome.runtime.getURL("/_favicon/") + "?pageUrl=" + encodeURIComponent(url) + "&size=32";
}

function normalizePin(rawUrl, rawTitle){
  let raw = String(rawUrl || "").trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    const host = u.hostname.replace(/^www\./, "");
    return { id: FP.uid("pin"), url: u.href, title: String(rawTitle || "").trim() || host };
  } catch { return null; }
}

async function getPins(){
  const d = await FP.get(["pins"]);
  return Array.isArray(d.pins) ? d.pins.filter(p => p && p.url) : [];
}

async function addPin(url, title){
  const pin = normalizePin(url, title);
  if (!pin) { FPUI.toast("Введите корректный адрес сайта", "error"); return false; }
  const pins = await getPins();
  if (pins.length >= MAX_PINS) { FPUI.toast("Максимум закреплённых: " + MAX_PINS, "error"); return false; }
  if (pins.some(p => p.url === pin.url)) { FPUI.toast("Уже закреплено", "error"); return false; }
  pins.push(pin);
  await FPUI.save({pins});
  FPUI.toast("Закреплено 📌");
  await renderPins();
  return true;
}

async function renderPins(){
  const box = $("pins");
  if (!box) return;
  const pins = await getPins();
  if (!pins.length) {
    box.innerHTML = `<div class="empty">Закрепи любимые сайты — они всегда будут под рукой.</div>`;
    return;
  }
  box.innerHTML = pins.map(p => `
    <div class="pin" draggable="true" data-pin-id="${FPUI.esc(p.id)}">
      <a class="pin-link" href="${FPUI.esc(p.url)}" title="${FPUI.esc(p.url)}">
        <span class="pin-ico"><img src="${FPUI.esc(pinIcon(p.url))}" alt="" draggable="false"><b hidden>${FPUI.esc((p.title||"?").trim().charAt(0).toUpperCase())}</b></span>
        <span class="pin-title">${FPUI.esc(p.title)}</span>
      </a>
      <button class="pin-del" data-del-pin="${FPUI.esc(p.id)}" title="Открепить">×</button>
    </div>`).join("");

  box.querySelectorAll(".pin-ico img").forEach(img => {
    img.addEventListener("error", () => {
      img.hidden = true;
      img.nextElementSibling.hidden = false;
    }, {once:true});
  });

  box.querySelectorAll("[data-del-pin]").forEach(btn => btn.onclick = async e => {
    e.preventDefault(); e.stopPropagation();
    const list = await getPins();
    await FPUI.save({pins: list.filter(p => p.id !== btn.dataset.delPin)});
    renderPins();
  });

  // перетаскивание для смены порядка
  let dragId = null;
  box.querySelectorAll(".pin").forEach(el => {
    el.addEventListener("dragstart", e => {
      dragId = el.dataset.pinId;
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      box.querySelectorAll(".pin").forEach(x => x.classList.remove("over"));
    });
    el.addEventListener("dragover", e => {
      e.preventDefault();
      if (el.dataset.pinId !== dragId) el.classList.add("over");
    });
    el.addEventListener("dragleave", () => el.classList.remove("over"));
    el.addEventListener("drop", async e => {
      e.preventDefault();
      el.classList.remove("over");
      const targetId = el.dataset.pinId;
      if (!dragId || dragId === targetId) return;
      const list = await getPins();
      const from = list.findIndex(p => p.id === dragId);
      const to = list.findIndex(p => p.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      await FPUI.save({pins: list});
      renderPins();
    });
  });
}

async function renderPinTabs(){
  const box = $("pinTabs");
  const [tabs, pins] = await Promise.all([chrome.tabs.query({}), getPins()]);
  const pinned = new Set(pins.map(p => p.url));
  const seen = new Set();
  const list = tabs.filter(t => {
    if (!t.url || !/^https?:/i.test(t.url) || pinned.has(t.url) || seen.has(t.url)) return false;
    seen.add(t.url);
    return true;
  });
  box.innerHTML = list.length
    ? list.map(t => `<button class="pin-tab" type="button" data-url="${FPUI.esc(t.url)}" data-title="${FPUI.esc(t.title || "")}"><img src="${FPUI.esc(pinIcon(t.url))}" alt=""><span>${FPUI.esc(t.title || t.url)}</span><i>＋</i></button>`).join("")
    : `<div class="empty">Нет подходящих открытых вкладок.</div>`;
  box.querySelectorAll(".pin-tab").forEach(b => b.onclick = async () => {
    if (await addPin(b.dataset.url, b.dataset.title)) renderPinTabs();
  });
}

function setupPins(){
  const form = $("pinForm"), tabsBox = $("pinTabs");
  $("pinAddToggle").onclick = () => {
    tabsBox.hidden = true;
    form.hidden = !form.hidden;
    if (!form.hidden) $("pinUrl").focus();
  };
  $("pinFromTabs").onclick = async () => {
    form.hidden = true;
    tabsBox.hidden = !tabsBox.hidden;
    if (!tabsBox.hidden) await renderPinTabs();
  };
  const save = async () => {
    if (await addPin($("pinUrl").value, $("pinTitle").value)) {
      $("pinUrl").value = ""; $("pinTitle").value = ""; form.hidden = true;
    }
  };
  $("pinSave").onclick = save;
  [$("pinUrl"), $("pinTitle")].forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") save(); }));
}

/* ---------- Микшер звуков ---------- */
const MIXER_CHANNELS = [
  ["rain", "🌧️", "Дождь"], ["waves", "🌊", "Волны"], ["wind", "💨", "Ветер"],
  ["fire", "🔥", "Костёр"], ["brown", "🟤", "Глубокий шум"], ["white", "⚪", "Белый шум"]
];
let mixerState = { master: 0.7, levels: {} };
let mixerSendTimer = null;

function mixerNormalize(m) {
  const out = { master: 0.7, levels: {} };
  if (Number.isFinite(Number(m?.master))) out.master = Math.min(1, Math.max(0, Number(m.master)));
  for (const [k] of MIXER_CHANNELS) {
    const v = Number(m?.levels?.[k]);
    out.levels[k] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  }
  return out;
}

function mixerSend() {
  clearTimeout(mixerSendTimer);
  mixerSendTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ type: "mixerSet", state: mixerState }).catch(() => {});
  }, 50);
}

function mixerPaint() {
  document.querySelectorAll("#mixerOff, .mixer-card [data-mix]").forEach(el => {
    if (el.dataset.mix === undefined || el === document.activeElement) return;
    const key = el.dataset.mix;
    el.value = Math.round((key === "master" ? mixerState.master : mixerState.levels[key] || 0) * 100);
  });
}

async function setupMixer() {
  const box = $("mixer");
  if (!box) return;
  const d = await FP.get(["mixer"]);
  mixerState = mixerNormalize(d.mixer);
  box.innerHTML = MIXER_CHANNELS.map(([k, icon, name]) =>
    `<label class="mixer-row"><span>${icon} ${name}</span><input type="range" min="0" max="100" data-mix="${k}"></label>`).join("");
  mixerPaint();

  document.querySelector(".mixer-card").addEventListener("input", e => {
    const key = e.target?.dataset?.mix;
    if (!key) return;
    const v = Number(e.target.value) / 100;
    if (key === "master") mixerState.master = v; else mixerState.levels[key] = v;
    mixerSend();
  });

  $("mixerOff").onclick = () => {
    for (const [k] of MIXER_CHANNELS) mixerState.levels[k] = 0;
    mixerPaint();
    mixerSend();
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.mixer?.newValue) {
      mixerState = mixerNormalize(changes.mixer.newValue);
      mixerPaint();
    }
  });
}
