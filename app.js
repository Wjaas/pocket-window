import { recommend, dueLabel } from './logic.js';

const KEY = 'pocket-window-v1';
const $ = id => document.getElementById(id);
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const state = load();
let availableMinutes = 30;
let availableEnergy = 'medium';
let filter = 'open';
let editingId = null;
let selectedId = null;
let remainingSeconds = 0;
let timerId = null;
let lastTick = 0;
let toastId = null;

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    if (value && Array.isArray(value.tasks)) return { tasks: value.tasks.filter(t => t && typeof t.title === 'string'), focusedSeconds: Number(value.focusedSeconds) || 0 };
  } catch { /* Corrupt or disabled storage starts a fresh planner. */ }
  return { tasks: [], focusedSeconds: 0 };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { showToast('Storage is unavailable; changes may not remain after closing.'); } }
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastId); toastId = setTimeout(() => toast.classList.remove('show'), 3200); }
function create(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function taskById(id) { return state.tasks.find(task => task.id === id); }
function energyLabel(value) { return value.charAt(0).toUpperCase() + value.slice(1); }

function renderTasks() {
  const list = $('task-list'); list.replaceChildren();
  const visible = state.tasks.filter(t => filter === 'all' || (filter === 'completed' ? t.done : !t.done)).sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt);
  $('task-count').textContent = state.tasks.filter(t => !t.done).length;
  if (!visible.length) { list.append(create('p', 'empty-state', filter === 'completed' ? 'Nothing completed yet. Your first win is waiting.' : filter === 'open' ? 'No tasks yet. Add one to find a useful next step.' : 'Your list is empty. Add a task to get started.')); return; }
  for (const task of visible) {
    const row = create('div', `task-row${task.done ? ' done' : ''}`);
    const main = create('div', 'task-main');
    const complete = create('button', `complete-button${task.done ? ' checked' : ''}`, task.done ? '✓' : ''); complete.type = 'button'; complete.setAttribute('aria-label', task.done ? `Mark ${task.title} as to do` : `Complete ${task.title}`); complete.addEventListener('click', () => toggleDone(task.id));
    const text = create('div', 'task-text'); text.append(create('div', 'task-title', task.title), create('div', 'task-sub', `${task.duration} min  ·  ${energyLabel(task.energy)} energy  ·  ${dueLabel(task.due)}`)); main.append(complete, text);
    const actions = create('div', 'task-actions');
    if (!task.done) { const focus = create('button', 'mini-button', 'Focus →'); focus.type = 'button'; focus.addEventListener('click', () => selectFocus(task.id)); actions.append(focus); }
    const edit = create('button', 'mini-button', 'Edit'); edit.type = 'button'; edit.addEventListener('click', () => openDialog(task.id));
    const remove = create('button', 'mini-button', 'Delete'); remove.type = 'button'; remove.addEventListener('click', () => deleteTask(task.id)); actions.append(edit, remove); row.append(main, actions); list.append(row);
  }
}
function renderSummary() { $('done-count').textContent = state.tasks.filter(t => t.done).length; $('minutes-count').textContent = Math.floor(state.focusedSeconds / 60); }
function renderRecommendation() {
  const result = recommend(state.tasks, availableMinutes, availableEnergy);
  const box = $('rec-content'); box.replaceChildren();
  if (!result) { box.append(create('h3', '', state.tasks.some(t => !t.done) ? 'Nothing fits just yet.' : 'Make space for a win.'), create('p', '', state.tasks.some(t => !t.done) ? 'Try more time, a higher energy level, or add a shorter task.' : 'Add a few tasks, then find one that fits your window.')); return; }
  const { task, days } = result;
  box.append(create('h3', '', task.title));
  const meta = create('div', 'rec-meta'); for (const value of [`${task.duration} min`, `${energyLabel(task.energy)} energy`, dueLabel(task.due)]) meta.append(create('span', '', value)); box.append(meta);
  box.append(create('p', '', days !== null && days <= 2 ? 'A good fit for your time, with a due date coming up.' : 'A good fit for your time and energy right now.'));
  const start = create('button', 'rec-action', 'Focus on this →'); start.type = 'button'; start.addEventListener('click', () => selectFocus(task.id)); box.append(start);
}
function render() { renderTasks(); renderSummary(); renderRecommendation(); renderFocus(); }
function openDialog(id = null) {
  editingId = id;
  const task = id ? taskById(id) : null;
  $('task-form').reset(); $('form-error').hidden = true;
  $('dialog-title').textContent = task ? 'Edit task' : 'Add a task'; $('save-task').textContent = task ? 'Save changes' : 'Save task';
  if (task) { $('task-title').value = task.title; $('task-duration').value = task.duration; $('task-energy').value = task.energy; $('task-due').value = task.due || ''; }
  $('task-dialog').showModal(); $('task-title').focus();
}
function closeDialog() { $('task-dialog').close(); editingId = null; }
function saveForm(event) {
  event.preventDefault();
  const title = $('task-title').value.trim();
  if (!title) { $('form-error').textContent = 'Give your task a name first.'; $('form-error').hidden = false; $('task-title').focus(); return; }
  const values = { title, duration: Number($('task-duration').value), energy: $('task-energy').value, due: $('task-due').value };
  const wasEditing = Boolean(editingId);
  if (editingId) { const task = taskById(editingId); if (task) Object.assign(task, values); }
  else state.tasks.push({ id: newId(), ...values, done: false, createdAt: Date.now() });
  save(); closeDialog(); render(); showToast(wasEditing ? 'Task updated.' : 'Task added.');
}
function toggleDone(id) {
  const task = taskById(id); if (!task) return;
  task.done = !task.done;
  if (task.done && selectedId === id) { pauseTimer(); selectedId = null; remainingSeconds = 0; }
  save(); render(); showToast(task.done ? 'A small win, done.' : 'Task moved back to your list.');
}
function deleteTask(id) {
  const task = taskById(id); if (!task || !confirm(`Delete “${task.title}”?`)) return;
  if (selectedId === id) { pauseTimer(); selectedId = null; remainingSeconds = 0; }
  state.tasks = state.tasks.filter(t => t.id !== id); save(); render(); showToast('Task deleted.');
}
function selectFocus(id) {
  const task = taskById(id); if (!task || task.done) return;
  pauseTimer(); selectedId = id; remainingSeconds = task.duration * 60; renderFocus(); $('focus-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderFocus() {
  const task = taskById(selectedId);
  $('focus-task').textContent = task?.title || 'Choose a task to begin';
  $('focus-note').textContent = task ? `${task.duration} minutes · ${energyLabel(task.energy)} energy · ${dueLabel(task.due)}` : 'Pick a recommendation above, or start from your task list.';
  $('timer-toggle').disabled = !task || remainingSeconds <= 0;
  $('timer-toggle').textContent = timerId ? 'Pause focus' : remainingSeconds < (task?.duration ?? 0) * 60 ? 'Resume focus' : 'Start focus';
  $('timer-reset').disabled = !task; $('finish-button').disabled = !task;
  const min = Math.floor(remainingSeconds / 60), sec = remainingSeconds % 60;
  $('timer-display').textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  document.title = timerId ? `${$('timer-display').textContent} · Pocket Window` : 'Pocket Window — make the gap count';
}
function tick() {
  if (!timerId) return;
  const now = Date.now(); const elapsed = Math.floor((now - lastTick) / 1000);
  if (elapsed < 1) return;
  lastTick += elapsed * 1000;
  const used = Math.min(elapsed, remainingSeconds);
  remainingSeconds -= used; state.focusedSeconds += used; save(); renderSummary(); renderFocus();
  if (remainingSeconds <= 0) { clearInterval(timerId); timerId = null; renderFocus(); showToast('Focus window complete! Mark the task done when you are ready.'); }
}
function pauseTimer() { if (!timerId) return; tick(); clearInterval(timerId); timerId = null; renderFocus(); }
function toggleTimer() { if (timerId) pauseTimer(); else if (selectedId && remainingSeconds > 0) { lastTick = Date.now(); timerId = setInterval(tick, 250); renderFocus(); } }
function resetTimer() { pauseTimer(); const task = taskById(selectedId); if (task) remainingSeconds = task.duration * 60; renderFocus(); }

for (const button of document.querySelectorAll('#time-choices .choice')) button.addEventListener('click', () => { availableMinutes = Number(button.dataset.minutes); document.querySelectorAll('#time-choices .choice').forEach(b => b.classList.toggle('selected', b === button)); renderRecommendation(); });
for (const button of document.querySelectorAll('#energy-choices .choice')) button.addEventListener('click', () => { availableEnergy = button.dataset.energy; document.querySelectorAll('#energy-choices .choice').forEach(b => b.classList.toggle('selected', b === button)); renderRecommendation(); });
for (const button of document.querySelectorAll('.tab')) button.addEventListener('click', () => { filter = button.dataset.filter; document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === button)); renderTasks(); });
$('find-button').addEventListener('click', () => { renderRecommendation(); $('recommendation').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('add-button').addEventListener('click', () => openDialog()); $('close-dialog').addEventListener('click', closeDialog); $('cancel-dialog').addEventListener('click', closeDialog); $('task-form').addEventListener('submit', saveForm);
$('timer-toggle').addEventListener('click', toggleTimer); $('timer-reset').addEventListener('click', resetTimer); $('finish-button').addEventListener('click', () => selectedId && toggleDone(selectedId));
render();
