/**
 * Simplified Operational Transformation utility
 * Handles concurrent edits by transforming operations against each other
 */

export const OP_TYPES = { INSERT: 'insert', DELETE: 'delete', RETAIN: 'retain' };

export function createDelta(oldText, newText) {
  const ops = [];
  let i = 0, j = 0;
  while (i < oldText.length && j < newText.length) {
    if (oldText[i] === newText[j]) { ops.push({ type: OP_TYPES.RETAIN, count: 1 }); i++; j++; }
    else break;
  }
  if (j < newText.length) ops.push({ type: OP_TYPES.INSERT, text: newText.slice(j) });
  if (i < oldText.length) ops.push({ type: OP_TYPES.DELETE, count: oldText.length - i });
  return ops;
}

export function applyDelta(text, delta) {
  let result = ''; let pos = 0;
  for (const op of delta) {
    if (op.type === OP_TYPES.RETAIN) { result += text.slice(pos, pos + op.count); pos += op.count; }
    else if (op.type === OP_TYPES.INSERT) { result += op.text; }
    else if (op.type === OP_TYPES.DELETE) { pos += op.count; }
  }
  result += text.slice(pos);
  return result;
}

export function transformPosition(pos, delta) {
  let offset = 0; let current = 0;
  for (const op of delta) {
    if (current >= pos) break;
    if (op.type === OP_TYPES.RETAIN) current += op.count;
    else if (op.type === OP_TYPES.INSERT) { offset += op.text.length; }
    else if (op.type === OP_TYPES.DELETE) { offset -= Math.min(op.count, pos - current); current += op.count; }
  }
  return Math.max(0, pos + offset);
}
