#!/usr/bin/env node
/**
 * Runs the three test groups sequentially with clear banners so the output
 * visibly distinguishes unit tests from API (integration) tests and
 * component tests.
 *
 * Exit status:
 *   - Aggregates across all three phases.
 *   - Prints a final summary with pass/fail counts per group.
 */
import { spawnSync } from 'node:child_process';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

const groups = [
  {
    name: 'UNIT TESTS',
    blurb: 'Pure functions (no IndexedDB, no DOM wiring)',
    script: 'test:unit'
  },
  {
    name: 'API / SERVICE-LAYER INTEGRATION TESTS',
    blurb: 'Service calls against fake-indexeddb (end-to-end business logic)',
    script: 'test:integration'
  },
  {
    name: 'COMPONENT / GUARD TESTS',
    blurb: 'RBAC route guard, masked-field rendering',
    script: 'test:component'
  }
];

function banner(color, title, blurb) {
  const line = '═'.repeat(Math.max(title.length + 4, 60));
  console.log(`\n${color}${BOLD}${line}${RESET}`);
  console.log(`${color}${BOLD}  ${title}${RESET}`);
  console.log(`${DIM}  ${blurb}${RESET}`);
  console.log(`${color}${BOLD}${line}${RESET}\n`);
}

const results = [];
for (const group of groups) {
  banner(CYAN, group.name, group.blurb);
  const proc = spawnSync('npm', ['run', '--silent', group.script], {
    stdio: 'inherit',
    shell: false,
    env: process.env
  });
  results.push({ ...group, code: proc.status ?? 1 });
}

console.log(`\n${BOLD}${CYAN}${'═'.repeat(60)}${RESET}`);
console.log(`${BOLD}${CYAN}  TEST RUN SUMMARY${RESET}`);
console.log(`${BOLD}${CYAN}${'═'.repeat(60)}${RESET}`);
let anyFailed = false;
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) anyFailed = true;
  const tag = ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  console.log(`  [${tag}]  ${r.name}`);
}
console.log(`${BOLD}${CYAN}${'═'.repeat(60)}${RESET}\n`);

if (anyFailed) {
  console.log(`${RED}${BOLD}One or more test groups failed.${RESET}`);
  process.exit(1);
} else {
  console.log(`${GREEN}${BOLD}All test groups passed.${RESET}`);
}
