// content/emails/*.html → lib/email-templates.ts (HTML šablóny ako reťazce; serverless funkcia nečíta súbory).
// Spúšťa sa po úprave šablóny: npm run emails. Test (lib/email.test.ts) stráži, že výstup je aktuálny.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function buildTemplatesModule() {
  const dir = path.join(root, 'content/emails');
  const files = readdirSync(dir).filter((f) => /^\d-.+\.html$/.test(f)).sort();
  const entries = files.map((f) => `  ${JSON.stringify(f.replace(/\.html$/, ''))}: ${JSON.stringify(readFileSync(path.join(dir, f), 'utf8'))},`);
  return `// VYGENEROVANÉ z content/emails/*.html (npm run emails). Needitovať ručne.\nexport const EMAIL_TEMPLATES = {\n${entries.join('\n')}\n} as const;\n\nexport type EmailTemplate = keyof typeof EMAIL_TEMPLATES;\n`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(path.join(root, 'lib/email-templates.ts'), buildTemplatesModule());
  console.log('lib/email-templates.ts vygenerovaný');
}
