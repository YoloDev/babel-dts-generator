/*eslint-disable*/
// this file needs to be runnable in node direct

const fs = require('fs');
const path = require('path');
const transform = require('babel-core').transform;
const ts = require('typescript');

const name = 'interface/property';
const content = fs.readFileSync(`${__dirname}/../spec/${name}.src.js`, 'utf-8');
debugger;
transform(content, {
  filename: name,
  filenameRelative: name,
  modules: 'common',
  sourceMap: false,
  moduleRoot: path.resolve(`${__dirname}/../src`).replace(/\\/g, '/'),
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
      suppressComments: false,
      dryRun: true
    }
  }
});
