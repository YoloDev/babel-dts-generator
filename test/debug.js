/*eslint-disable*/
// this file needs to be runnable in node direct

const fs = require('fs');
const path = require('path');
const transform = require('babel-core').transform;
const ts = require('typescript');

const name = 'class/method';
const content = fs.readFileSync(`${__dirname}/../spec/${name}.src.js`, 'utf-8');
debugger;
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
  presets: ['stage-1', 'es2015'],
  //loose: 'all',
  plugins: [
    'syntax-flow',
    ['./lib/index', {
      packageName: 'spec',
      typings: '',
      suppressModulePath: true,
      suppressComments: false
    }]
  ]
});
