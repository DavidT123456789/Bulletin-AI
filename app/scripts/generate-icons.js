import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { getIcons } from '@iconify/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_APP_ROOT = path.resolve(__dirname, '..');

export const ICON_COLLECTIONS = [
    'solar',
    'ph',
    'lucide',
    'logos',
    'line-md',
    'svg-spinners',
    'simple-icons',
    'mdi'
];

// Explicit variants for template-interpolated icons (key = prefix before `${...}`)
export const DYNAMIC_ICON_TEMPLATES = {
    'solar:pin-': ['solar:pin-bold', 'solar:pin-linear']
};

const COLLECTION_PATTERN = ICON_COLLECTIONS.join('|');
const PREFIXED_ICON_REGEX = new RegExp(
    `(?<![a-z0-9-])(${COLLECTION_PATTERN}):([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9-]|\\$\\{)`,
    'g'
);
const DYNAMIC_TEMPLATE_REGEX = new RegExp(
    `(?<![a-z0-9-])((?:${COLLECTION_PATTERN}):[a-z0-9-]+)\\$\\{`,
    'g'
);
const ICONIFY_TAG_ICON_ATTR_REGEX = /<iconify-icon\b[^>]*\bicon=(["'])([^"']+)\1/g;

function collectSourceFiles(dir, { includeLanding, excludeLanding } = {}, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'generated' || entry.name === 'node_modules') continue;
            if (excludeLanding && entry.name === 'landing') continue;
            if (includeLanding && path.basename(dir) === 'src' && entry.name !== 'landing') continue;
            collectSourceFiles(fullPath, { includeLanding, excludeLanding }, out);
        } else if (
            entry.isFile() &&
            entry.name.endsWith('.js') &&
            !entry.name.endsWith('.test.js') &&
            !entry.name.endsWith('.spec.js')
        ) {
            out.push(fullPath);
        }
    }
    return out;
}

function getTargetFiles(appRoot, target) {
    const srcDir = path.join(appRoot, 'src');
    if (target === 'landing') {
        return [
            path.join(appRoot, 'index.html'),
            ...collectSourceFiles(srcDir, { includeLanding: true })
        ].filter((filePath) => fs.existsSync(filePath));
    }
    if (target === 'app') {
        return [
            path.join(appRoot, 'app.html'),
            ...collectSourceFiles(srcDir, { excludeLanding: true })
        ].filter((filePath) => fs.existsSync(filePath));
    }
    return [
        path.join(appRoot, 'app.html'),
        path.join(appRoot, 'index.html'),
        ...collectSourceFiles(srcDir)
    ].filter((filePath) => fs.existsSync(filePath));
}

/**
 * Scans HTML entrypoints and JS modules for all Iconify icons in use.
 * @param {string} [appRoot]
 * @param {'all'|'app'|'landing'} [target='all']
 * @returns {{ iconsByPrefix: Record<string, string[]>, totalUnique: number, invalidTagIcons: Array<{file: string, value: string}>, unregisteredDynamicIcons: Array<{file: string, template: string}> }}
 */
export function scanUsedIcons(appRoot = DEFAULT_APP_ROOT, target = 'all') {
    const filesToScan = getTargetFiles(appRoot, target);
    const iconsByPrefixMap = new Map();
    const invalidTagIcons = [];
    const unregisteredDynamicIcons = [];

    const addIconName = (prefix, name) => {
        if (!iconsByPrefixMap.has(prefix)) {
            iconsByPrefixMap.set(prefix, new Set());
        }
        iconsByPrefixMap.get(prefix).add(name);
    };

    for (const filePath of filesToScan) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relFile = path.relative(appRoot, filePath).replace(/\\/g, '/');

        for (const match of content.matchAll(PREFIXED_ICON_REGEX)) {
            addIconName(match[1], match[2]);
        }

        for (const match of content.matchAll(DYNAMIC_TEMPLATE_REGEX)) {
            const templatePrefix = match[1];
            const variants = DYNAMIC_ICON_TEMPLATES[templatePrefix];
            if (!variants) {
                unregisteredDynamicIcons.push({ file: relFile, template: `${templatePrefix}\${...}` });
                continue;
            }
            for (const icon of variants) {
                const [prefix, name] = icon.split(':');
                addIconName(prefix, name);
            }
        }

        for (const match of content.matchAll(ICONIFY_TAG_ICON_ATTR_REGEX)) {
            const rawValue = match[2].trim();
            if (rawValue.includes('${')) continue;
            const colonIdx = rawValue.indexOf(':');
            const prefix = colonIdx > 0 ? rawValue.slice(0, colonIdx) : '';
            if (!ICON_COLLECTIONS.includes(prefix)) {
                invalidTagIcons.push({ file: relFile, value: rawValue });
            }
        }
    }

    const iconsByPrefix = {};
    let totalUnique = 0;
    for (const prefix of [...iconsByPrefixMap.keys()].sort()) {
        const sortedNames = [...iconsByPrefixMap.get(prefix)].sort();
        iconsByPrefix[prefix] = sortedNames;
        totalUnique += sortedNames.length;
    }

    return { iconsByPrefix, totalUnique, invalidTagIcons, unregisteredDynamicIcons };
}

/**
 * Extracts minimal IconifyJSON subsets from local @iconify-json/* packages.
 * Throws if any requested icon does not exist in its collection.
 * @param {Record<string, string[]>} iconsByPrefix
 * @param {string} [appRoot]
 * @returns {Array<Object>}
 */
export function extractIconCollections(iconsByPrefix, appRoot = DEFAULT_APP_ROOT) {
    const requireFromRoot = createRequire(path.join(appRoot, 'package.json'));
    const collections = [];
    const missingIcons = [];

    for (const prefix of Object.keys(iconsByPrefix).sort()) {
        const names = [...iconsByPrefix[prefix]].sort();
        if (names.length === 0) continue;

        let rawCollection;
        try {
            rawCollection = requireFromRoot(`@iconify-json/${prefix}/icons.json`);
        } catch (err) {
            throw new Error(`Missing @iconify-json/${prefix} package for prefix "${prefix}": ${err.message}`);
        }

        const extracted = getIcons(rawCollection, names, true);
        if (!extracted) {
            missingIcons.push(...names.map((n) => `${prefix}:${n}`));
            continue;
        }

        const availableNames = new Set([
            ...Object.keys(extracted.icons || {}),
            ...Object.keys(extracted.aliases || {})
        ]);
        for (const name of names) {
            if (!availableNames.has(name)) {
                missingIcons.push(`${prefix}:${name}`);
            }
        }

        const minimal = {
            prefix: extracted.prefix,
            icons: extracted.icons
        };
        if (extracted.aliases && Object.keys(extracted.aliases).length > 0) {
            minimal.aliases = extracted.aliases;
        }
        if (typeof extracted.width === 'number') {
            minimal.width = extracted.width;
        }
        if (typeof extracted.height === 'number') {
            minimal.height = extracted.height;
        }
        collections.push(minimal);
    }

    if (missingIcons.length > 0) {
        throw new Error(`Unknown Iconify icon(s) referenced in source: ${missingIcons.join(', ')}`);
    }

    return collections;
}

function writeTargetBundle(appRoot, target, filename) {
    const { iconsByPrefix, totalUnique, invalidTagIcons, unregisteredDynamicIcons } = scanUsedIcons(appRoot, target);

    if (invalidTagIcons.length > 0) {
        const details = invalidTagIcons.map((item) => `${item.file} -> "${item.value}"`).join(', ');
        throw new Error(`Invalid or unsupported <iconify-icon> prefix(es): ${details}`);
    }

    if (unregisteredDynamicIcons.length > 0) {
        const details = unregisteredDynamicIcons.map((item) => `${item.file} -> "${item.template}"`).join(', ');
        throw new Error(`Unregistered dynamic Iconify template(s) (add to DYNAMIC_ICON_TEMPLATES): ${details}`);
    }

    const collections = extractIconCollections(iconsByPrefix, appRoot);
    const outDir = path.join(appRoot, 'src', 'generated');
    fs.mkdirSync(outDir, { recursive: true });

    const outputPath = path.join(outDir, filename);
    const fileContent = [
        '// AUTO-GENERATED FILE — DO NOT EDIT MANUALLY.',
        '// Regenerate with: npm run generate-icons',
        "import 'iconify-icon';",
        "import { addCollection } from 'iconify-icon';",
        '',
        `const COLLECTIONS = ${JSON.stringify(collections)};`,
        '',
        'for (const collection of COLLECTIONS) {',
        '    addCollection(collection);',
        '}',
        '',
        '// Workaround iconify-icon@3.0.5 IntersectionObserver bug on hidden/reparented elements:',
        '// stopObserver() sets _visible=true while disconnected, causing reconnect to skip rendering.',
        "const IconifyIconElement = typeof customElements !== 'undefined' ? customElements.get('iconify-icon') : null;",
        'if (IconifyIconElement?.prototype && !IconifyIconElement.prototype.__observerPatched) {',
        '    IconifyIconElement.prototype.__observerPatched = true;',
        '    IconifyIconElement.prototype.startObserver = function () {',
        '        this._visible = true;',
        '    };',
        "    if (typeof document !== 'undefined') {",
        "        document.querySelectorAll('iconify-icon').forEach((el) => el.stopObserver?.());",
        '    }',
        '}',
        ''
    ].join('\n');

    const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : null;
    if (existing !== fileContent) {
        fs.writeFileSync(outputPath, fileContent, 'utf-8');
    }

    return {
        outputPath,
        totalUnique,
        prefixes: Object.keys(iconsByPrefix)
    };
}

/**
 * Generates separate minimal offline icon bundles for landing (index.html) and app (app.html).
 * @param {string} [appRoot]
 * @returns {{ app: { outputPath: string, totalUnique: number, prefixes: string[] }, landing: { outputPath: string, totalUnique: number, prefixes: string[] } }}
 */
export function generateIconsBundles(appRoot = DEFAULT_APP_ROOT) {
    return {
        app: writeTargetBundle(appRoot, 'app', 'icons-app.js'),
        landing: writeTargetBundle(appRoot, 'landing', 'icons-landing.js')
    };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
    const { app, landing } = generateIconsBundles();
    console.log(
        `✅ icons-app.js ready: ${app.totalUnique} icons (${app.prefixes.join(', ')}) | icons-landing.js ready: ${landing.totalUnique} icons (${landing.prefixes.join(', ')})`
    );
}
