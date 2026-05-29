const STORAGE_KEY = "kuota-main-state-v1";
const SECOND = 1000;

const defaultState = {
  balanceSeconds: 0,
  dailyGoalSeconds: 5 * 60 * 60,
  activities: [],
};

let state = loadState();
let selectedMode = "study";
let manualMode = "study";
let historyFilter = "all";
let toastTimer = 0;
let timerId = 0;

const session = {
  active: false,
  mode: "study",
  elapsedSeconds: 0,
  startedAt: 0,
  limitSeconds: null,
};

const elements = {
  todayLabel: document.querySelector("#todayLabel"),
  quotaRing: document.querySelector("#quotaRing"),
  balanceHours: document.querySelector("#balanceHours"),
  balanceMinutes: document.querySelector("#balanceMinutes"),
  balanceText: document.querySelector("#balanceText"),
  balanceStatus: document.querySelector("#balanceStatus"),
  studyToday: document.querySelector("#studyToday"),
  playToday: document.querySelector("#playToday"),
  goalProgress: document.querySelector("#goalProgress"),
  studyAll: document.querySelector("#studyAll"),
  playAll: document.querySelector("#playAll"),
  goalHours: document.querySelector("#goalHours"),
  goalMeter: document.querySelector("#goalMeter"),
  modeTitle: document.querySelector("#modeTitle"),
  sessionStatus: document.querySelector("#sessionStatus"),
  timerDisplay: document.querySelector("#timerDisplay"),
  startPauseButton: document.querySelector("#startPauseButton"),
  finishButton: document.querySelector("#finishButton"),
  resetSessionButton: document.querySelector("#resetSessionButton"),
  manualForm: document.querySelector("#manualForm"),
  manualSaveButton: document.querySelector("#manualSaveButton"),
  manualMinutes: document.querySelector("#manualMinutes"),
  manualNote: document.querySelector("#manualNote"),
  undoButton: document.querySelector("#undoButton"),
  resetAllButton: document.querySelector("#resetAllButton"),
  historyList: document.querySelector("#historyList"),
  toast: document.querySelector("#toast"),
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.activities)) {
      return { ...defaultState };
    }
    return {
      ...defaultState,
      ...stored,
      balanceSeconds: Number(stored.balanceSeconds) || 0,
      dailyGoalSeconds: Number(stored.dailyGoalSeconds) || defaultState.dailyGoalSeconds,
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sameDay(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function todayActivities() {
  const now = new Date();
  return state.activities.filter((activity) => sameDay(new Date(activity.createdAt), now));
}

function sumActivities(type, activities = state.activities) {
  return activities
    .filter((activity) => activity.type === type)
    .reduce((total, activity) => total + activity.seconds, 0);
}

function formatShort(totalSeconds) {
  const sign = totalSeconds < 0 ? "-" : "";
  const seconds = Math.abs(Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${sign}${hours}j ${minutes}m`;
}

function formatLong(totalSeconds) {
  const sign = totalSeconds < 0 ? "-" : "";
  const seconds = Math.abs(Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) {
    return `${sign}${minutes} menit`;
  }
  return `${sign}${hours} jam ${minutes} menit`;
}

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hrs = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2600);
}

function addActivity(type, seconds, note = "") {
  const safeSeconds = Math.max(1, Math.floor(seconds));
  const activity = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    type,
    seconds: safeSeconds,
    note: note.trim(),
    createdAt: new Date().toISOString(),
  };

  if (type === "study") {
    state.balanceSeconds += safeSeconds;
  } else {
    state.balanceSeconds -= safeSeconds;
  }

  state.activities.unshift(activity);
  saveState();
  render();
  showToast(type === "study" ? "Saldo main bertambah." : "Saldo main terpakai.");
}

function undoLastActivity() {
  const [last] = state.activities;
  if (!last) {
    showToast("Belum ada catatan.");
    return;
  }

  state.activities.shift();
  state.balanceSeconds += last.type === "study" ? -last.seconds : last.seconds;
  saveState();
  render();
  showToast("Catatan terakhir dibatalkan.");
}

function resetAllData() {
  const confirmed = window.confirm("Reset semua saldo dan riwayat?");
  if (!confirmed) {
    return;
  }
  stopSession(false);
  state = { ...defaultState, activities: [] };
  saveState();
  render();
  showToast("Data direset.");
}

function setMode(mode) {
  if (session.active || session.elapsedSeconds > 0) {
    showToast("Selesaikan atau reset sesi aktif dulu.");
    return;
  }
  selectedMode = mode;
  session.mode = mode;
  render();
}

function setManualMode(mode) {
  manualMode = mode;
  render();
}

function startSession() {
  if (selectedMode === "play" && state.balanceSeconds <= 0) {
    showToast("Saldo main belum tersedia.");
    return;
  }

  session.active = true;
  session.mode = selectedMode;
  session.startedAt = Date.now();
  session.limitSeconds = selectedMode === "play" ? Math.max(1, Math.floor(state.balanceSeconds)) : null;
  timerId = window.setInterval(tickSession, SECOND);
  tickSession();
}

function pauseSession() {
  if (!session.active) {
    return;
  }
  session.elapsedSeconds = currentElapsed();
  session.active = false;
  session.startedAt = 0;
  clearInterval(timerId);
  render();
}

function stopSession(saveActivity) {
  const seconds = currentElapsed();
  clearInterval(timerId);
  session.active = false;
  session.elapsedSeconds = 0;
  session.startedAt = 0;
  session.limitSeconds = null;

  if (saveActivity && seconds >= 1) {
    addActivity(selectedMode, seconds);
    return;
  }

  render();
}

function finishSession() {
  const seconds = currentElapsed();
  if (seconds < 1) {
    showToast("Sesi masih kosong.");
    return;
  }

  if (selectedMode === "play" && seconds > state.balanceSeconds) {
    addActivity("play", Math.max(0, state.balanceSeconds));
    resetSessionOnly();
    return;
  }

  stopSession(true);
}

function resetSessionOnly() {
  clearInterval(timerId);
  session.active = false;
  session.elapsedSeconds = 0;
  session.startedAt = 0;
  session.limitSeconds = null;
  render();
}

function currentElapsed() {
  const runningSeconds = session.active ? Math.floor((Date.now() - session.startedAt) / SECOND) : 0;
  const elapsed = session.elapsedSeconds + runningSeconds;
  if (session.mode === "play" && session.limitSeconds !== null) {
    return Math.min(elapsed, session.limitSeconds);
  }
  return elapsed;
}

function tickSession() {
  if (session.mode === "play" && session.limitSeconds !== null && currentElapsed() >= session.limitSeconds) {
    stopSession(true);
    showToast("Saldo main habis.");
    return;
  }
  renderSession();
}

function handleManualSubmit(event) {
  event.preventDefault();
  const minutes = Number(elements.manualMinutes.value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    showToast("Isi durasi yang valid.");
    return;
  }

  const seconds = Math.round(minutes * 60);
  if (manualMode === "play" && seconds > state.balanceSeconds) {
    showToast("Saldo main tidak cukup.");
    return;
  }

  addActivity(manualMode, seconds, elements.manualNote.value);
  elements.manualNote.value = "";
}

function updateGoal() {
  const hours = Number(elements.goalHours.value);
  if (!Number.isFinite(hours) || hours <= 0) {
    elements.goalHours.value = String(defaultState.dailyGoalSeconds / 3600);
    state.dailyGoalSeconds = defaultState.dailyGoalSeconds;
  } else {
    state.dailyGoalSeconds = Math.round(hours * 3600);
  }
  saveState();
  render();
}

function render() {
  const today = todayActivities();
  const studyToday = sumActivities("study", today);
  const playToday = sumActivities("play", today);
  const studyAll = sumActivities("study");
  const playAll = sumActivities("play");
  const goalPercent = state.dailyGoalSeconds > 0 ? Math.min(100, Math.round((studyToday / state.dailyGoalSeconds) * 100)) : 0;
  const balanceHours = Math.floor(Math.abs(state.balanceSeconds) / 3600);
  const balanceMinutes = Math.floor((Math.abs(state.balanceSeconds) % 3600) / 60);
  const ringPercent = Math.min(100, Math.max(0, (state.balanceSeconds / Math.max(state.dailyGoalSeconds, 3600)) * 100));

  elements.todayLabel.textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());

  elements.quotaRing.style.setProperty("--progress", `${ringPercent * 3.6}deg`);
  elements.balanceHours.textContent = `${state.balanceSeconds < 0 ? "-" : ""}${balanceHours}j`;
  elements.balanceMinutes.textContent = `${balanceMinutes}m`;
  elements.balanceText.textContent = formatLong(state.balanceSeconds);
  elements.balanceStatus.textContent = balanceStatusText();
  elements.studyToday.textContent = formatShort(studyToday);
  elements.playToday.textContent = formatShort(playToday);
  elements.goalProgress.textContent = `${goalPercent}%`;
  elements.studyAll.textContent = formatShort(studyAll);
  elements.playAll.textContent = formatShort(playAll);
  elements.goalHours.value = String(Math.round(state.dailyGoalSeconds / 3600));
  elements.goalMeter.style.width = `${goalPercent}%`;

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === selectedMode);
  });
  document.querySelectorAll("[data-manual-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.manualMode === manualMode);
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === historyFilter);
  });

  elements.modeTitle.textContent = selectedMode === "study" ? "Belajar" : "Main";
  elements.undoButton.disabled = state.activities.length === 0;

  renderSession();
  renderHistory();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function balanceStatusText() {
  if (state.balanceSeconds < 0) {
    return "Saldo minus. Tutup dengan belajar.";
  }
  if (state.balanceSeconds === 0) {
    return "Mulai dari sesi belajar pertama.";
  }
  const hours = state.balanceSeconds / 3600;
  if (hours >= 5) {
    return "Kuota panjang siap dipakai.";
  }
  return "Kuota tersimpan.";
}

function renderSession() {
  const elapsed = currentElapsed();
  const canFinish = elapsed >= 1;
  const canReset = elapsed >= 1 || session.active;
  const isPlayBlocked = selectedMode === "play" && state.balanceSeconds <= 0 && elapsed === 0;

  elements.timerDisplay.textContent = formatClock(elapsed);
  elements.timerDisplay.setAttribute("datetime", `PT${Math.floor(elapsed)}S`);
  elements.finishButton.disabled = !canFinish;
  elements.resetSessionButton.disabled = !canReset;
  elements.startPauseButton.disabled = isPlayBlocked;

  const iconName = session.active ? "pause" : "play";
  elements.startPauseButton.innerHTML = `<i data-lucide="${iconName}"></i><span>${session.active ? "Jeda" : "Mulai"}</span>`;

  if (session.active) {
    elements.sessionStatus.textContent = selectedMode === "study" ? "Belajar berjalan" : "Main berjalan";
  } else if (elapsed > 0) {
    elements.sessionStatus.textContent = "Dijeda";
  } else if (isPlayBlocked) {
    elements.sessionStatus.textContent = "Saldo main kosong";
  } else {
    elements.sessionStatus.textContent = "Siap";
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderHistory() {
  const source =
    historyFilter === "today"
      ? state.activities.filter((activity) => sameDay(new Date(activity.createdAt), new Date()))
      : state.activities;

  if (source.length === 0) {
    elements.historyList.innerHTML = `<li class="empty-state">Belum ada aktivitas.</li>`;
    return;
  }

  elements.historyList.innerHTML = source
    .slice(0, 80)
    .map((activity) => {
      const isStudy = activity.type === "study";
      const title = isStudy ? "Belajar" : "Main";
      const icon = isStudy ? "book-open" : "gamepad-2";
      const badge = isStudy ? "study" : "play";
      const note = activity.note ? ` - ${escapeHtml(activity.note)}` : "";
      const sign = isStudy ? "+" : "-";
      return `
        <li class="history-item">
          <span class="icon-badge ${badge}"><i data-lucide="${icon}"></i></span>
          <div>
            <h3>${title}</h3>
            <p>${formatDateTime(activity.createdAt)}${note}</p>
          </div>
          <span class="history-duration">${sign}${formatShort(activity.seconds)}</span>
        </li>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll("[data-manual-mode]").forEach((button) => {
  button.addEventListener("click", () => setManualMode(button.dataset.manualMode));
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    historyFilter = button.dataset.filter;
    render();
  });
});

elements.startPauseButton.addEventListener("click", () => {
  if (session.active) {
    pauseSession();
  } else {
    startSession();
  }
});

elements.finishButton.addEventListener("click", finishSession);
elements.resetSessionButton.addEventListener("click", resetSessionOnly);
elements.manualForm.addEventListener("submit", handleManualSubmit);
elements.manualSaveButton.addEventListener("click", handleManualSubmit);
elements.goalHours.addEventListener("change", updateGoal);
elements.undoButton.addEventListener("click", undoLastActivity);
elements.resetAllButton.addEventListener("click", resetAllData);

render();
