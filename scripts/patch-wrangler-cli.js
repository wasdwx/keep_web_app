import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fixedLine = 'const data = new Date(value.replaceAll(/[\\u2013\\u2014]/g, "-"));';

const files = [
  join(process.cwd(), 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js'),
  join(process.cwd(), 'node_modules', 'miniflare', 'dist', 'src', 'index.js'),
  join(process.cwd(), 'node_modules', 'miniflare', 'dist', 'src', 'shared', 'dev-registry.worker.js'),
];

for (const filePath of files) {
  if (!existsSync(filePath)) {
    continue;
  }

  const source = readFileSync(filePath, 'utf8');
  const patched = source.replaceAll(
    /const (data\d*) = new Date\(value\.replaceAll\(\/[^\n]*?, "-"\)\);/g,
    (_, variableName) => `const ${variableName} = new Date(value.replaceAll(/[\\u2013\\u2014]/g, "-"));`,
  );

  if (patched !== source) {
    writeFileSync(filePath, patched, 'utf8');
    console.log(`[patch-wrangler-cli] fixed invalid dash regex in ${filePath}`);
  }
}

const undiciFormatterPath = join(
  process.cwd(),
  'node_modules',
  'undici',
  'lib',
  'mock',
  'pending-interceptors-formatter.js',
);

if (existsSync(undiciFormatterPath)) {
  const source = readFileSync(undiciFormatterPath, 'utf8');
  let patched = source.replace(
    /const PERSISTENT = process\.versions\.icu \? '[^\n]*? : 'Y '/,
    "const PERSISTENT = process.versions.icu ? '\\u2713' : 'Y '",
  );
  patched = patched.replace(
    /const NOT_PERSISTENT = process\.versions\.icu \? '[^\n]*? : 'N '/,
    "const NOT_PERSISTENT = process.versions.icu ? '\\u2717' : 'N '",
  );

  if (patched !== source) {
    writeFileSync(undiciFormatterPath, patched, 'utf8');
    console.log(`[patch-wrangler-cli] fixed invalid checkmark string in ${undiciFormatterPath}`);
  }
}
