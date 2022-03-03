import { readFile, readdir, writeFile, lstat } from 'fs/promises';
import { promisify } from 'util';
import { join, extname } from 'path';
import { default as yaml } from 'yaml';
import mkdirp from 'mkdirp';
import rimrafSync from 'rimraf';

const rimraf = promisify(rimrafSync);

const {
    SOURCES_DIR = './sources',
    PWD,
} = process.env;

const sourcePath = join(PWD, SOURCES_DIR);

async function writeIndices(files) {
    const cjsIndex = files
      .filter(({ name }) => !/\*/.test(name))
      .reduce((acc, { name, path }) => `${acc}module.exports.${name.replace(/\//g, '_')} = require('./${path}');\n`, '');
    await writeFile('./cjs/index.js', cjsIndex);
    const esmImports = files
      .filter(({ name }) => !/\*/.test(name))
      .reduce((acc, { name, path }) => `${acc}import ${name.replace(/\//g, '_')} from './${path}.mjs';\n`, '');
    const esmIndex = `${esmImports}\nexport default { ${files.filter(({ name }) => !/\*/.test(name)).map(({ name }) => name.replace(/\//g, '_')).join(', ')} };\n`;
    await writeFile('./esm/index.mjs', esmIndex);
}

async function processFile(pfx) {
    const contents = yaml.parse(await readFile(join(sourcePath, `${pfx}.yaml`)).then((b) => b.toString()));
    const contentsESM = Object.keys(contents)
      .reduce((acc, key) => `${acc}export const ${key} = ${JSON.stringify(contents[key])};\n`, '')
      .concat(`export default { ${Object.keys(contents).join(', ')} };`);
    const contentsCJS = Object.keys(contents).reduce((acc, key) => `${acc}module.exports.${key} = ${JSON.stringify(contents[key])};\n`, '');
    await writeFile(`./cjs/${pfx}.js`, contentsCJS);
    await writeFile(`./esm/${pfx}.mjs`, contentsESM);
    return { name: pfx, path: pfx }
}

async function config() {
    await mkdirp('./cjs/config');
    await mkdirp('./esm/config');

    const contents = yaml.parse(await readFile(join(sourcePath, `config.yaml`)).then((b) => b.toString()));
    const { secrets } = contents;

    const contentsESM = Object.keys(contents)
      .reduce((acc, key) => `${acc}export const ${key} = ${JSON.stringify(contents[key])};\n`, '')
      .concat(`export default { ${Object.keys(contents).join(', ')} };`);
    const contentsCJS = Object.keys(contents).reduce((acc, key) => `${acc}module.exports.${key} = ${JSON.stringify(contents[key])};\n`, '');
    await writeFile(`./cjs/config.js`, contentsCJS);
    await writeFile(`./esm/config.mjs`, contentsESM);


    const secretsESM = Object.keys(secrets)
      .reduce((acc, key) => `${acc}export const ${key} = ${JSON.stringify(secrets[key])};\n`, '')
      .concat(`export default { ${Object.keys(secrets).join(', ')} };`);
    const secretsCJS = Object.keys(secrets).reduce((acc, key) => `${acc}module.exports.${key} = ${JSON.stringify(secrets[key])};\n`, '');
    await writeFile(`./cjs/config/secrets.js`, secretsCJS);
    await writeFile(`./esm/config/secrets.mjs`, secretsESM);

    return [
        { name: 'config', path: 'config' },
        { name: 'config/secrets', path: 'config/secrets' },
    ];
}

async function translations() {
    const exp = [];
    await mkdirp('./cjs/i18n/keys');
    await mkdirp('./esm/i18n/keys');
    await mkdirp('./cjs/i18n/bundles');
    await mkdirp('./esm/i18n/bundles');

    const files = await readdir(join(sourcePath, 'translations'));
    const keys = {};
    const backend = {};

    for (const file of files) {
        const fullPath = join(sourcePath, 'translations', file);
        const stat = await lstat(fullPath);
        if (stat.isDirectory()) {
            const ns = file;
            keys[ns] ??= {};
            backend[ns] ??= {};
            const lngFiles = await readdir(fullPath);
            for (const lngFile of lngFiles) {
                const lngPath = join(fullPath, lngFile);
                const stat = await lstat(lngPath);
                if (stat.isFile() && extname(lngFile) === '.yaml') {
                    const contents = yaml.parse(await readFile(lngPath).then((b) => b.toString()));
                    const lng = lngFile.replace(extname(lngFile), '');
                    backend[ns][lng] ??= {};
                    Object.assign(backend[ns][lng], contents);
                    const nsKeys = Object.keys(contents).reduce((acc, key) => ({ ...acc, [key]: `${ns}:${key}` }), {});
                    Object.assign(keys[ns], nsKeys);
                }
            }
        } else {
            const ns = file.replace(extname(file), '');
            keys[ns] ??= {};
            backend[ns] ??= {};
            const contents = yaml.parse(await readFile(fullPath).then((b) => b.toString()));
            for (const lng in contents) {
                backend[ns][lng] ??= {};
                Object.assign(backend[ns][lng], contents[lng]);
                const nsKeys = Object.keys(contents[lng]).reduce((acc, key) => ({ ...acc, [key]: `${ns}:${key}` }), {});
                Object.assign(keys[ns], nsKeys);
            }
        }
    }

    // Write translation keys files
    exp.push({ name: `i18n/keys`, path: 'i18n/keys' });
    exp.push({ name: `i18n/keys/*`, path: `i18n/keys/*` });
    let keysESM = '';
    let keysCJS = '';
    for (const ns in keys) {
        const keysString = JSON.stringify(keys[ns]);
        keysESM += `export const ${ns} = ${keysString};\n`;
        keysCJS += `module.exports.${ns} = ${keysString};\n`;
        let nsESM = '';
        let nsCJS = '';
        for (const key in keys[ns]) {
            nsESM += `export const ${key} = ${JSON.stringify(keys[ns][key])};\n`;
            nsCJS += `module.exports.${key} = ${JSON.stringify(keys[ns][key])};\n`;
        }
        nsESM += `export default { ${Object.keys(keys[ns]).join(', ')} };\n`;
        await writeFile(`./esm/i18n/keys/${ns}.mjs`, nsESM);
        await writeFile(`./cjs/i18n/keys/${ns}.js`, nsCJS);
    }
    keysESM += `export default { ${Object.keys(keys).join(', ')} };\n`
    await writeFile('./esm/i18n/keys.mjs', keysESM);
    await writeFile('./cjs/i18n/keys.js', keysCJS);

    // Write translation keys files
    exp.push({ name: `i18n/bundles`, path: 'i18n/bundles' });
    exp.push({ name: `i18n/bundles/*`, path: `i18n/bundles/*` });
    let bundleESM = '';
    let bundleCJS = '';
    for (const ns in backend) {
        const keysString = JSON.stringify(backend[ns]);
        bundleESM += `const ${ns} = ${keysString};\n`;
        bundleCJS += `module.exports.${ns} = ${keysString};\n`;
        let nsESM = '';
        let nsCJS = '';
        for (const key in backend[ns]) {
            nsESM += `const ${key} = ${JSON.stringify(backend[ns][key])};\n`;
            nsCJS += `module.exports.${key} = ${JSON.stringify(backend[ns][key])};\n`;
        }
        nsESM += `export default { ${Object.keys(backend[ns]).join(', ')} };\n`;
        await writeFile(`./esm/i18n/bundles/${ns}.mjs`, nsESM);
        await writeFile(`./cjs/i18n/bundles/${ns}.js`, nsCJS);
    }
    bundleESM += `export default { ${Object.keys(backend).join(', ')} };\n`
    await writeFile('./esm/i18n/bundles.mjs', bundleESM);
    await writeFile('./cjs/i18n/bundles.js', bundleCJS);

    return exp;
}

export async function clean() {
    await rimraf('./cjs');
    await rimraf('./esm');
    const packageContents = await readFile('./package.json').then((buf) => JSON.parse(buf.toString()));
    delete packageContents['exports'];
    await writeFile('./package.json', JSON.stringify(packageContents, null, '    '));
}

export default async function() {
    await clean();
    await mkdirp('./cjs');
    await mkdirp('./esm');

    const outputs = (await readdir(sourcePath))
        .map((fName) => fName.replace(extname(fName), ''))
        .map((key) => {
            switch (key) {
                case 'translations':
                    return translations();
                case 'config':
                    return config();
                default:
                    return processFile(key);
            }
        });

    const files = (await Promise.all(outputs)).reduce((acc, v) => acc.concat(v), []);

    // create cjs index
    await writeIndices(files);

    // write the package exports
    const packageContents = await readFile('./package.json').then((buf) => JSON.parse(buf.toString()));
    packageContents.exports ??= {};
    packageContents.exports['.'] = { require: `./cjs/index.js`, import: `./esm/index.mjs` };
    for (const { name, path } of files) {
        packageContents.exports[`./${name}`] = { require: `./cjs/${path}.js`, import: `./esm/${path}.mjs` };
    }
    await writeFile('./package.json', JSON.stringify(packageContents, null, '    '));
}
