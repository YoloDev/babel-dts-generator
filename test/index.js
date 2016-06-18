import glob from 'glob-promise';
import fs from 'fs';
import path from 'path';
import clc from 'cli-color';
import { diffLines } from 'diff';
import { transform } from 'babel-core';

function exists(path) {
  return new Promise(resolve => {
    fs.exists(path, resolve);
  });
}

function read(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, { encoding: 'utf-8' }, (err, result) => {
      if (err) {
        return reject(err);
      }

      resolve(result);
    });
  });
}

function normalize(str) {
  return str.replace(/\r\n/g, '\n');
}

function run(files, index, errors) {
  const file = files[index];
  const expectedFile = file.replace('.src.js', '.expected.ts');
  const suppressAmbientDeclaration = false;
  return exists(expectedFile).then(fileExists => {
    if (!fileExists) {
      console.error(`File ${expectedFile} does not exist.`);
      process.exit(1); // eslint-disable-line
      return Promise.resolve(null);
    }

    return read(file).then(content => {
      const name = file.replace('.src.js', '.js');
      transform(content, {
        filename: name,
        filenameRelative: name,
        //modules: 'common',
        sourceMap: false,
        moduleRoot: path.resolve('./src').replace(/\\/g, '/'),
        moduleIds: false,
        //experimental: false,
        comments: false,
        compact: false,
        code: true,
        presets: ['es2015', 'stage-1'],
        //loose: 'all',
        plugins: [
          'syntax-flow',
          ['babel-dts-generator', {
            packageName: 'spec',
            typings: '',
            ignoreMembers: '^_.*',
            suppressModulePath: true,
            suppressComments: false,
            suppressAmbientDeclaration: suppressAmbientDeclaration
          }],
          'transform-decorators-legacy'
        ]
      });

      const dtsName = file.replace('.src.js', '.d.ts');
      return exists(dtsName).then(dtsExists => {
        if (!dtsExists) {
          console.error(clc.red('Error: ') + clc.magenta(file) + clc.red('. Dts file not found.'));
          errors += 1;
          return null;
        }

        return read(dtsName).then(actual => {
          return read(expectedFile).then(expected => {
            expected = normalize(expected);
            actual = normalize(actual);

            expected = expected.trim();
            if (!suppressAmbientDeclaration) {
              actual = actual.split('\n').slice(1, -1).map(l => l.substring(2)/* remove leading whitespace */).join('\n').trim();
            } else {
              actual = actual.replace(/export declare/g, 'export').trim();
            }

            const diff = diffLines(expected, actual, { ignoreWhitespace: true });
            if (diff.length > 1 || diff[0].removed) {
              console.error(clc.red('Error: ') + clc.magenta(file));
              diff.forEach(part => {
                // green for additions, red for deletions
                // grey for common parts
                /* eslint-disable no-nested-ternary, lines-around-comment */
                const color = part.added ? 'green' :
                    part.removed ? 'red' : 'yellow';
                /* eslint-enable no-nested-ternary, lines-around-comment */

                console.error(clc[color](printify(part.value)));
              });
              console.error();

              errors += 1;
            } else {
              console.log(clc.green('Success: ') + clc.magenta(file));
            }
          });
        });
      }).then(_ => {
        if (index === files.length - 1) {
          // Done
          process.exit(errors); // eslint-disable-line
        } else {
          return run(files, index + 1, errors);
        }
      });
    });
  });
}

glob('spec/**/*.src.js').then(files => {
  return run(files, 0, 0);
}).catch(e => {
  console.error(e);
  process.exit(1); // eslint-disable-line
});

function printify(str) {
  return str
    .replace(/[\n\r]/g, '\n')
    .replace(/ /g, '·')
    .replace(/\t/g, '—')
    .trimRight();
}
