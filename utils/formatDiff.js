/**
 * utils/formatDiffForAudit.js
 *
 * Produce a simple, audit-friendly diff between two objects in this exact format:
 * [
 *   { field_name: "a.b", old_value: "old", new_value: "new" },
 *   ...
 * ]
 *
 * - Compares nested objects and arrays recursively.
 * - Field paths use dot notation with array indices in square brackets: "items[0].name"
 * - old_value and new_value are strings:
 *     - primitives -> String(value)
 *     - Date -> ISO string
 *     - object/array -> JSON.stringify(value)
 *     - null/undefined -> "" (empty string)
 *
 * Usage:
 *   const { formatDiffForAudit } = require('./utils/formatDiffForAudit');
 *   const diff = formatDiffForAudit(oldObj, newObj);
 *
 * Example output:
 *   [{ field_name:"name", old_value:"Alice", new_value:"Alice B." },
 *    { field_name:"address.city", old_value:"Mumbai", new_value:"Pune" }]
 */

function isPlainObject(v) {
  return Object.prototype.toString.call(v) === '[object Object]';
}

function isDate(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function stringifyValue(v) {
  if (v === undefined || v === null) return '';
  if (isDate(v)) return v.toISOString();
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch (e) {
    return String(v);
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (isDate(a) && isDate(b)) return a.getTime() === b.getTime();
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return a === b;

  // arrays
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // plain objects
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

/**
 * Recursively walks oldObj and newObj and collects differences
 * into the required array format.
 *
 * @param {any} oldVal
 * @param {any} newVal
 * @param {string} path - current path ('' for root)
 * @param {Array} out - accumulator for differences
 */
function walkDiff(oldVal, newVal, path, out) {
  // both equal -> nothing to do
  if (deepEqual(oldVal, newVal)) return;

  // If both are plain objects, descend into keys
  if (isPlainObject(oldVal) && isPlainObject(newVal)) {
    const keys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
    for (const key of keys) {
      const childOld = oldVal[key];
      const childNew = newVal[key];
      const childPath = path ? `${path}.${key}` : key;
      walkDiff(childOld, childNew, childPath, out);
    }
    return;
  }

  // If both are arrays, iterate indices
  if (Array.isArray(oldVal) || Array.isArray(newVal)) {
    const a = Array.isArray(oldVal) ? oldVal : [];
    const b = Array.isArray(newVal) ? newVal : [];
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      const ai = a[i];
      const bi = b[i];
      const childPath = `${path}[${i}]`;
      walkDiff(ai, bi, childPath, out);
    }
    return;
  }

  // Fallback: primitive or differing non-plain objects -> record change
  out.push({
    field_name: path || '$', // use '$' for root-level primitive change
    old_value: stringifyValue(oldVal),
    new_value: stringifyValue(newVal),
  });
}

/**
 * Public function
 * @param {Object} oldObj
 * @param {Object} newObj
 * @returns {Array<{field_name:string, old_value:string, new_value:string}>}
 */
function formatDiffData(oldObj, newObj) {
  const out = [];
  walkDiff(oldObj, newObj, '', out);
  return out;
}

module.exports = { formatDiffData };