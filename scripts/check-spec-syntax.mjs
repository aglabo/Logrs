#!/usr/bin/env node
// src: scripts/check-spec-syntax.mjs
// @(#) : Logrs specification self-consistency checker
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SPEC_DIR = 'logrs/specifications';

// 01-syntax-core の <non-ascii> : %xA0-D7FF / %xE000-FFFD / %x10000-10FFFF
const isNonAscii = (cp) =>
  (cp >= 0xa0 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);

// <identifier> ::= (ALPHA / "_") *(ALPHA / DIGIT / "_" / "-")
const IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const KNOWN_SCOPES = new Set(['@session', '@scoped', '@*']);
const MASK = String.fromCharCode(1);
const BACKSLASH = String.fromCharCode(92);

const findings = [];
const report = (file, line, rule, msg) => findings.push({ file, line, rule, msg });

/**
 * Collect ```text / ```abnf fenced blocks with their body lines.
 * A fence preceded by `<!-- logrs-check: skip -->` is not DSL and is ignored
 * (syntax-error demonstrations, evaluation tables written in meta-notation).
 */
const extractFences = (lines) => {
  const fences = [];
  let open = null;
  let skipNext = false;
  lines.forEach((l, i) => {
    if (l.trim() === '<!-- logrs-check: skip -->') {
      skipNext = true;
      return;
    }
    if (l.startsWith('```')) {
      if (open === null) {
        const isDsl = /^```(text|abnf)\s*$/.test(l) && !skipNext;
        skipNext = false;
        open = isDsl ? { body: [] } : { body: null };
      } else {
        if (open.body) fences.push(open);
        open = null;
      }
      return;
    }
    if (open?.body) open.body.push({ line: i + 1, text: l });
  });
  return fences;
};

/** Blank out string literals, heredoc bodies and comments: lexical rules stop there. */
const maskLiterals = (text) => {
  let out = '';
  let i = 0;
  const skip = (stop) => {
    for (let k = i; k < stop; k++) out += text[k] === '\n' ? '\n' : MASK;
    i = stop;
  };
  while (i < text.length) {
    if (text.startsWith('<<<', i)) {
      const end = text.indexOf('<<<', i + 3);
      skip(end === -1 ? text.length : end + 3);
      continue;
    }
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch && text[j] !== '\n') {
        if (ch === '"' && text[j] === BACKSLASH) j++;
        j++;
      }
      skip(Math.min(j + 1, text.length));
      continue;
    }
    if (ch === ';') {
      const nl = text.indexOf('\n', i);
      skip(nl === -1 ? text.length : nl);
      continue;
    }
    out += ch;
    i++;
  }
  return out;
};

const checkFence = (file, fence) => {
  const masked = maskLiterals(fence.body.map((b) => b.text).join('\n')).split('\n');
  const lineOf = (k) => fence.body[k].line;

  // 1. 字句クラスに収まらない文字 (リテラル内外を問わない)
  for (const { line, text } of fence.body) {
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp < 0x80 || isNonAscii(cp)) continue;
      report(file, line, 'non-ascii', `字句クラス外の文字 ${JSON.stringify(ch)} (U+${cp.toString(16).toUpperCase()})`);
    }
  }

  masked.forEach((l, k) => {
    // 2. <block-kind> の識別子
    const m = l.match(/(?:^|\s)%(\S+)((?:\s+\S+)*?)\s*\{\{/);
    if (m) {
      if (!IDENT.test(m[1])) report(file, lineOf(k), 'block-kind', `% の直後が識別子ではない: ${m[1]}`);
      for (const w of m[2].trim().split(/\s+/).filter(Boolean)) {
        if (w === '->') break;
        if (IDENT.test(w) || /^\+[A-Za-z_][A-Za-z0-9_-]*$/.test(w)) continue;
        report(file, lineOf(k), 'block-kind', `block-kind の識別子として不正: ${w}`);
        break;
      }
    }

    // 3. リテラル外に残った非 ASCII = 裸のオペランド
    for (const ch of l) {
      const cp = ch.codePointAt(0);
      if (cp < 0x80 || ch === MASK) continue;
      report(file, lineOf(k), 'bare-non-ascii', `リテラル外の非 ASCII: ${JSON.stringify(ch)}`);
      break;
    }
  });

  // 4. ブロックの対応
  let depth = 0;
  masked.forEach((l, k) => {
    for (const m of l.matchAll(/\{\{|\}\}/g)) {
      depth += m[0] === '{{' ? 1 : -1;
      if (depth < 0) {
        report(file, lineOf(k), 'block-balance', '対応しない }}');
        depth = 0;
      }
    }
  });
  if (depth !== 0) {
    report(file, lineOf(fence.body.length - 1), 'block-balance', `閉じられていないブロックが ${depth} 個`);
  }
};

const files = readdirSync(SPEC_DIR).filter((f) => /^(\d\d-.*|README)\.md$/.test(f)).sort();
const sources = files.map((f) => [f, readFileSync(join(SPEC_DIR, f), 'utf8')]);

for (const [file, raw] of sources) {
  for (const fence of extractFences(raw.split(/\r?\n/))) checkFence(file, fence);
}

// 5. 未定義シンボルの参照
const definedEvents = new Set();
const usedEvents = new Map();
const usedScopes = new Map();
// イベント名はメタ変数 (#event_name) と実イベント (#ProcessFailed) を
// 頭文字で区別する。定義を要求するのは後者だけ。
const isConcreteEvent = (n) => /^[A-Z]/.test(n);
for (const [file, raw] of sources) {
  for (const fence of extractFences(raw.split(/\r?\n/))) {
    for (const { line, text: l } of fence.body) {
      for (const m of l.matchAll(/(?:^|\s)#([A-Za-z_][A-Za-z0-9_-]*)\s*(?:\(|\{\{)/g)) definedEvents.add(m[1]);
      for (const m of l.matchAll(/(?:!#|<-#)([A-Za-z_][A-Za-z0-9_-]*)/g)) {
        if (!usedEvents.has(m[1])) usedEvents.set(m[1], [file, line]);
      }
      for (const m of l.matchAll(/(?:^|\s)(@(?:\*|[A-Za-z_][A-Za-z0-9_-]*))/g)) {
        if (!usedScopes.has(m[1])) usedScopes.set(m[1], [file, line]);
      }
    }
  }
}
for (const [name, [file, line]] of usedEvents) {
  if (isConcreteEvent(name) && !definedEvents.has(name)) {
    report(file, line, 'undefined-event', `未定義のイベント #${name}`);
  }
}
for (const [name, [file, line]] of usedScopes) {
  if (!KNOWN_SCOPES.has(name)) report(file, line, 'undefined-scope', `未宣言のスコープ ${name}`);
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
for (const f of findings) console.log(`${SPEC_DIR}/${f.file}:${f.line}  [${f.rule}] ${f.msg}`);
console.log(`\n${findings.length} finding(s) across ${files.length} file(s).`);
process.exit(findings.length ? 1 : 0);
