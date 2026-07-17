import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const roots = ['src/components', 'src/screens'];
const files: string[] = [];
function walk(path: string): void { const stat = statSync(path); if (stat.isDirectory()) readdirSync(path).forEach(name => walk(resolve(path, name))); else if (/\.(ts|tsx)$/.test(path)) files.push(path); }
roots.forEach(root => walk(resolve(process.cwd(), root)));
const violations: string[] = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const jsxText = content.match(/(?<![=])>\s*[A-Za-zÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽáäčďéíĺľňóôŕšťúýž][^<{]*</g) ?? [];
  for (const text of jsxText) if (!text.includes('>⌂<')) violations.push(`${file}: ${text.trim()}`);
}
if (violations.length) { console.error(`Possible hardcoded UI copy:\n${violations.join('\n')}`); process.exit(1); }
console.log('Visible copy check passed.');
