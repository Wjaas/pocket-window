import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend, dueLabel } from '../dist/logic.js';

const now = new Date('2026-10-23T12:00:00');
const task = (id, duration, energy, due = '') => ({ id, duration, energy, due, done: false, createdAt: id.charCodeAt(0) });

test('matches available time and energy and skips completed tasks', () => {
  const tasks = [task('a', 45, 'low'), task('b', 30, 'high'), { ...task('c', 15, 'low'), done: true }, task('d', 15, 'low')];
  assert.equal(recommend(tasks, 30, 'low', now).task.id, 'd');
  assert.equal(recommend(tasks, 10, 'high', now), null);
});

test('prioritizes an approaching due date among fitting tasks', () => {
  const tasks = [task('a', 30, 'low'), task('b', 15, 'low', '2026-10-24')];
  assert.equal(recommend(tasks, 30, 'medium', now).task.id, 'b');
  assert.equal(dueLabel('2026-10-24', now), 'Due tomorrow');
});
