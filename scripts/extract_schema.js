import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../src');
const serverFile = path.join(__dirname, '../server.js');

const filesToProcess = [];

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
            filesToProcess.push(fullPath);
        }
    }
}

try {
    walkDir(srcDir);
    filesToProcess.push(serverFile);
} catch (e) { }

const tables = {};

function addTableField(table, field, type = 'TEXT') {
    if (!tables[table]) tables[table] = { fields: new Set() };
    if (field && field !== '*' && !field.includes('(')) {
        tables[table].fields.add(field);
    }
}

for (const file of filesToProcess) {
    const content = fs.readFileSync(file, 'utf8');

    // Find supabase.from('table')
    const fromRegex = /from\(['"]([^'"]+)['"]\)/g;
    let match;

    // We will do a simpler approach: finding blocks of code with .from('table')
    // and grabbing all word characters used in select, eq, order, insert, upsert.
    // Actually, a naive regex for inserts/upserts:
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const fromMatch = lines[i].match(/from\(['"]([^'"]+)['"]\)/);
        if (fromMatch) {
            const tableName = fromMatch[1];
            if (!tables[tableName]) tables[tableName] = { fields: new Set() };

            // look ahead up to 20 lines for select, eq, insert
            const block = lines.slice(i, i + 20).join('\n');

            // .select('id, name, ...')
            const selectMatch = block.match(/\.select\(['"]([^'"]+)['"]\)/);
            if (selectMatch) {
                selectMatch[1].split(',').forEach(f => {
                    let cleanField = f.trim();
                    addTableField(tableName, cleanField);
                });
            }

            // .eq('field', ...)
            const eqMatches = [...block.matchAll(/\.eq\(['"]([^'"]+)['"]/g)];
            eqMatches.forEach(m => addTableField(tableName, m[1]));

            // .in('field', ...)
            const inMatches = [...block.matchAll(/\.in\(['"]([^'"]+)['"]/g)];
            inMatches.forEach(m => addTableField(tableName, m[1]));

            // .order('field', ...)
            const orderMatches = [...block.matchAll(/\.order\(['"]([^'"]+)['"]/g)];
            orderMatches.forEach(m => addTableField(tableName, m[1]));

            // Just searching for objects being inserted like insert([{ field1: ..., field2: ... }])
            // We can use a regex to find keys in objects nearby
            const objectRegex = /([{,]\s*)([a-zA-Z_0-9]+)\s*:/g;
            const objMatches = [...block.matchAll(objectRegex)];
            objMatches.forEach(m => {
                const key = m[2];
                // ignore common JS keywords or variables that might be caught
                if (!['const', 'let', 'var', 'return', 'if', 'else'].includes(key)) {
                    addTableField(tableName, key);
                }
            });
        }
    }
}

for (const [table, data] of Object.entries(tables)) {
    console.log(`\nTABLE: ${table}`);
    console.log(`FIELDS: ${Array.from(data.fields).join(', ')}`);
}
