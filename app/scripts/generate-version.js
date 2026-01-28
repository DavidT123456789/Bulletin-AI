import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// ES Module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getGitInfo = () => {
    try {
        const hash = execSync('git rev-parse --short HEAD').toString().trim();
        const message = execSync('git log -1 --pretty=%s').toString().trim();
        return { hash, message };
    } catch (e) {
        console.warn('Failed to fetch git info:', e.message);
        return { hash: 'dev', message: 'Development build' };
    }
};

const gitInfo = getGitInfo();
const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

const versionData = {
    version: packageJson.version,
    hash: gitInfo.hash,
    message: gitInfo.message,
    date: new Date().toISOString()
};

const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'version.json'), JSON.stringify(versionData, null, 2));

console.log('✅ version.json generated:', versionData);
