#!/usr/bin/env node
/**
 * Fails the build if a JSON/JSONC config file contains a duplicate object key.
 *
 * Why this exists: `tsc` accepts a JSON file with two identical keys and
 * silently uses the *last* one. That is how `tsconfig.json` ended up with two
 * `types` entries, where the file appeared to enable `vite/client` but the
 * second `types` key quietly overrode it. Nothing errored - the project just
 * behaved differently from how the file read. Vite warns, but the warning
 * scrolls past in CI and nobody sees it.
 *
 * JSON.parse cannot help here either: it silently collapses duplicates. So
 * this walks the source itself with a minimal recursive-descent parser, which
 * sees every key as it is written.
 *
 * Handles JSONC (comments and trailing commas) because that is what
 * `tsconfig.json` uses.
 *
 * Usage: node scripts/check-json-configs.mjs [file...]
 * Exits 1 and prints every offender if any duplicate is found.
 */

import { readFileSync } from 'node:fs';

/** Remove `//` and block comments plus trailing commas, respecting strings. */
function stripJsonc(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let inString = false;
  let quote = '';

  while (i < n) {
    const c = text[i];
    const next = text[i + 1];

    if (inString) {
      out += c;
      if (c === '\\') {
        // Copy the escaped character verbatim.
        if (i + 1 < n) out += text[i + 1];
        i += 2;
        continue;
      }
      if (c === quote) inString = false;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      out += c;
      i += 1;
      continue;
    }

    if (c === '/' && next === '/') {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }

    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    out += c;
    i += 1;
  }

  // Drop trailing commas before } or ].
  return out.replace(/,(\s*[}\]])/g, '$1');
}

class DuplicateKeyScanner {
  constructor(src, file) {
    this.s = src;
    this.i = 0;
    this.file = file;
    this.duplicates = [];
  }

  get line() {
    let n = 1;
    for (let k = 0; k < this.i && k < this.s.length; k++) {
      if (this.s[k] === '\n') n += 1;
    }
    return n;
  }

  error(msg) {
    throw new Error(`${this.file}: ${msg}`);
  }

  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i += 1;
  }

  parseValue(path) {
    this.ws();
    const c = this.s[this.i];
    if (c === undefined) this.error('unexpected end of input');
    if (c === '{') return this.parseObject(path);
    if (c === '[') return this.parseArray(path);
    if (c === '"' || c === "'") return this.parseString();
    // number / true / false / null
    const start = this.i;
    while (this.i < this.s.length && !/[,}\]\s]/.test(this.s[this.i])) this.i += 1;
    if (start === this.i) this.error(`unexpected character ${JSON.stringify(c)}`);
    return this.s.slice(start, this.i);
  }

  parseString() {
    const quote = this.s[this.i];
    this.i += 1;
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === '\\') {
        this.i += 2;
        continue;
      }
      if (c === quote) {
        this.i += 1;
        return this.s.slice(0, 0);
      }
      this.i += 1;
    }
    this.error('unterminated string');
    return '';
  }

  parseObject(path) {
    this.i += 1; // {
    const seen = new Map();
    this.ws();
    if (this.s[this.i] === '}') {
      this.i += 1;
      return;
    }
    for (;;) {
      if (this.s[this.i] !== '"' && this.s[this.i] !== "'") {
        this.error(
          `expected a quoted property name, found ${JSON.stringify(this.s[this.i] ?? '<end of file>')}`,
        );
      }
      const keyLine = this.line;
      const keyStart = this.i;
      this.parseString();
      const key = this.s.slice(keyStart + 1, this.i - 1);

      if (seen.has(key)) {
        this.duplicates.push(
          `${this.file}: duplicate key "${key}" (first seen line ${seen.get(key)}, repeated line ${keyLine})`,
        );
      } else {
        seen.set(key, keyLine);
      }

      this.ws();
      if (this.s[this.i] !== ':') {
        this.error(`expected ":" after property "${key}"`);
      }
      this.i += 1;
      this.parseValue(path ? `${path}.${key}` : key);

      // A value must be followed by a comma or the closing brace. Without this
      // check `{ "a": 1 "b": 2 }` parses as if it were valid and the script
      // would cheerfully report "ok" on a file that is simply broken.
      this.ws();
      const c = this.s[this.i];
      if (c === ',') {
        this.i += 1;
        this.ws();
        if (this.s[this.i] === '}') {
          this.i += 1; // trailing comma
          return;
        }
        continue;
      }
      if (c === '}') {
        this.i += 1;
        return;
      }
      this.error(
        `expected "," or "}" after the value for "${key}", found ${JSON.stringify(c ?? '<end of file>')}`,
      );
    }
  }

  parseArray(path) {
    this.i += 1; // [
    this.ws();
    if (this.s[this.i] === ']') {
      this.i += 1;
      return;
    }
    for (;;) {
      this.parseValue(path ? `${path}[]` : path);
      this.ws();
      const c = this.s[this.i];
      if (c === ',') {
        this.i += 1;
        this.ws();
        if (this.s[this.i] === ']') {
          this.i += 1; // trailing comma
          return;
        }
        continue;
      }
      if (c === ']') {
        this.i += 1;
        return;
      }
      this.error(
        `expected "," or "]" after an array element, found ${JSON.stringify(c ?? '<end of file>')}`,
      );
    }
  }
}

const DEFAULT_FILES = ['tsconfig.json', 'package.json'];

const files = process.argv.slice(2);
const targets = files.length > 0 ? files : DEFAULT_FILES;

let failed = false;

for (const file of targets) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    console.error(`check-json-configs: cannot read ${file}`);
    failed = true;
    continue;
  }

  const scanner = new DuplicateKeyScanner(stripJsonc(raw), file);
  try {
    scanner.parseValue('');
    // Trailing content means we mis-parsed something; treat as a hard error
    // rather than silently passing.
    scanner.ws();
    if (scanner.i < scanner.s.length) {
      scanner.error('unexpected trailing content');
    }
  } catch (err) {
    console.error(`check-json-configs: ${err.message}`);
    failed = true;
    continue;
  }

  if (scanner.duplicates.length > 0) {
    for (const d of scanner.duplicates) console.error(`check-json-configs: ${d}`);
    console.error(
      'check-json-configs: duplicate keys are silently collapsed by JSON.parse and by tsc, ' +
        'so the file will not behave the way it reads. Remove the earlier key.',
    );
    failed = true;
  } else {
    console.log(`check-json-configs: ${file} ok`);
  }
}

process.exit(failed ? 1 : 0);
