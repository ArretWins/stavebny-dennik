import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { translationKeys } from '../src/i18n';

const missing: string[] = [];
const files = ['src/components', 'src/screens', 'src/state', 'src/services'].map(folder => resolve(process.cwd(), folder));
function walk(path: string): string[] { const stat = statSync(path); if (stat.isDirectory()) return readdirSync(path).flatMap(name => walk(resolve(path, name))); return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : []; }
for (const file of files.flatMap(walk)) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) if (!translationKeys.includes(match[1])) missing.push(`${file}: ${match[1]}`);
}
if (missing.length) { console.error(`Missing translation keys:\n${missing.join('\n')}`); process.exit(1); }
console.log(`Translation key check passed (${translationKeys.length} Slovak keys).`);
