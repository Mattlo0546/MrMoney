/** Undo stack of full state snapshots. Undo restores the prior state exactly (deep equal). */
import type { EngineState } from './types';

export interface UndoStack {
  entries: EngineState[];
  limit: number;
}

export function createUndoStack(limit = 20): UndoStack {
  return { entries: [], limit };
}

/** Push the state as it was BEFORE a change is committed. */
export function pushSnapshot(stack: UndoStack, before: EngineState): UndoStack {
  const entries = [...stack.entries, structuredClone(before)];
  return { entries: entries.slice(Math.max(0, entries.length - stack.limit)), limit: stack.limit };
}

export function canUndo(stack: UndoStack): boolean {
  return stack.entries.length > 0;
}

export function undo(stack: UndoStack): { stack: UndoStack; state: EngineState } | null {
  if (!stack.entries.length) return null;
  const state = structuredClone(stack.entries[stack.entries.length - 1]);
  return { stack: { entries: stack.entries.slice(0, -1), limit: stack.limit }, state };
}

/** Commit helper: returns the new state and the stack with the old state pushed. */
export function commit(stack: UndoStack, before: EngineState, next: EngineState): { stack: UndoStack; state: EngineState } {
  return { stack: pushSnapshot(stack, before), state: next };
}
