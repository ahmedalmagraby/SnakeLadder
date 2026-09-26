/**
 * The duplicate-JSON-key guard is a CI step, which means a bug in it fails the
 * build (or, worse, silently passes). These tests pin its behaviour.
 *
 * The first version of this check was an inline `node -e` heredoc in the
 * workflow, and it broke on the first real input because it called
 * `JSON.parse` on `tsconfig.json` - which is JSONC and contains comments.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'check-json-configs.mjs');

function run(files: string[]) {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...files], { encoding: 'utf8' });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function withFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'jsoncfg-'));
  const p = join(dir, name);
  writeFileSync(p, contents);
  return p;
}

describe('check-json-configs', () => {
  it('passes the real project configs', () => {
    const r = run([]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('tsconfig.json ok');
    expect(r.out).toContain('package.json ok');
  });

  it('accepts JSONC: comments, trailing commas, escaped quotes', () => {
    const p = withFile(
      'ok.json',
      `{
  // line comment
  "a": 1, /* block
  comment */
  "b": { "x": [1, 2, 3,], "y": "not // a comment", "z": "quote \\" inside", },
  "c": "tail comma below",
}
`,
    );
    const r = run([p]);
    expect(r.code, r.out).toBe(0);
  });

  it('flags a duplicate key, the exact bug this exists for', () => {
    const p = withFile('dup.json', `{
  "compilerOptions": {
    "types": ["node", "vite/client"],
    "types": ["node"]
  }
}`);
    const r = run([p]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('duplicate key "types"');
    // It must say where, not just that.
    expect(r.out).toMatch(/line \d+/);
  });

  it('flags a duplicate key nested inside an array', () => {
    const p = withFile('dup2.json', '{ "list": [ { "id": 1 }, { "id": 2, "id": 3 } ] }');
    const r = run([p]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('duplicate key "id"');
  });

  it('does not mistake a repeated value for a repeated key', () => {
    const p = withFile('nope.json', '{ "a": "same", "b": "same", "c": ["same", "same"] }');
    const r = run([p]);
    expect(r.code, r.out).toBe(0);
  });

  it('rejects genuinely malformed JSON rather than reporting ok', () => {
    // A missing comma used to slip through the first version of the parser.
    const p = withFile('bad.json', '{ "a": 1 "b": 2 }');
    const r = run([p]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/expected "," or "}"/);
  });

  it('fails on an unreadable file', () => {
    const r = run(['definitely-not-here.json']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('cannot read');
  });

  it('the workflow calls the script rather than inlining it', async () => {
    const { readFileSync } = await import('node:fs');
    const yml = readFileSync(join(process.cwd(), '.github', 'workflows', 'deploy.yml'), 'utf8');
    // An executable `node -e` is what broke the first version.
    const executable = yml
      .split(/\r?\n/)
      .filter((l) => /^\s*run:/i.test(l) && /node\s+-e/.test(l));
    expect(executable, 'workflow must not inline node -e').toEqual([]);
    expect(yml).toContain('node scripts/check-json-configs.mjs');
  });
});
