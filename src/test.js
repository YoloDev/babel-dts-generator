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
    fs.readFile(path, {encoding: 'utf-8'}, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function normalize(str) {
  return str.replace(/\r\n/g, '\n');
}

function trimEnd(str) {
  return str.replace(/\s+$/, '');
}

function run(files, index, errors) {
  var file = files[index];
  var expectedFile = file.replace('.src.js', '.expected.ts');
  return exists(expectedFile).then(fileExists => {
    if (!fileExists) {
      console.error(`File ${expectedFile} does not exist.`);
      process.exit(1);
      return;
    }

    return read(file).then(content => {
      let name = file.replace('.src.js', '.js');
      let result = transform(content, {
        filename: name,
        filenameRelative: name,
        modules: 'common',
        sourceMap: false,
        moduleRoot: path.resolve('./src').replace(/\\/g, '/'),
        moduleIds: false,
        experimental: false,
        comments: false,
        compact: false,
        code: true,
        stage: 2,
        loose: 'all',
        optional: [
          'es7.decorators',
          'es7.classProperties'
        ],
        plugins: [
          './lib/index'
        ],
        extra: {
          dts: {
            packageName: 'spec',
            typings: '',
            suppressModulePath: true,
            suppressComments: false
          }
        }
      });

      let dtsName = file.replace('.src.js', '.d.ts');
      return read(dtsName).then(actual => {
        return read(expectedFile).then(expected => {
          expected = normalize(expected);
          actual = normalize(actual);

          expected = expected.trim();
          actual = actual.split('\n').slice(1, -1).map(l => l.substring(2) /* remove leading whitespace */).join('\n').trim();

          let diff = diffLines(expected, actual, {ignoreWhitespace: true});
          if (diff.length > 1) {
            console.error(clc.red('Error: ') + clc.magenta(file));
            diff.forEach(part => {
              // green for additions, red for deletions
              // grey for common parts
              var color = part.added ? 'green' :
                  part.removed ? 'red' : 'yellow';

              console.error(clc[color](part.value.trim()));
            });
            console.error();

            errors += 1;
          } else {
            console.log(clc.green('Success: ') + clc.magenta(file));
          }

          if (index == files.length - 1) {
            // Done
            process.exit(errors);
          } else {
            return run(files, index + 1, errors);
          }
        });
      });
    });
  });
}

glob('spec/**/*.src.js').then(files => {
  return run(files, 0, 0);
}).catch(e => console.error(e));
