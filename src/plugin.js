import { relative, join } from 'path';
import fs from 'fs';

import { ensureDir } from './fs-utils';
import { generate, createNodeGenerator } from './generators';

const symb = Symbol('dts-meta');

function withMeta(visitFn) {
  return function visit(path, { file: { metadata } }) {
    const meta = metadata[symb];
    return visitFn(path, meta, metadata);
  };
}

const skipper = {
  enter: withMeta((path, { moduleExports, skipStack, nodeGenerator }) => {
    //debugger;

    if (skipStack.length === 0) {
      moduleExports.push(nodeGenerator(path.node));
    }

    skipStack.push(path);
  }),

  exit: withMeta((path, { skipStack }) => {
    //debugger;
    for (let i = skipStack.length - 1; i >= 0; i--) {
      const item = skipStack[i];
      if (item === path) {
        skipStack.splice(i, skipStack.length);
        return;
      }
    }

    throw new Error('skipStack error: path not found');
  })
};

export function plugin({ types: t }) { // eslint-disable-line
  return {
    visitor: {
      ExportAllDeclaration: withMeta(({ node }, { moduleExports, nodeGenerator }) => {
        moduleExports.push(nodeGenerator(node));
      }),

      ExportNamedDeclaration: skipper,

      ExportDefaultDeclaration: skipper,

      ClassDeclaration: skipper,

      ImportDeclaration: withMeta(({ node }, { moduleImports, nodeGenerator }) => {
        moduleImports.push(nodeGenerator(node));
      }),

      InterfaceDeclaration: withMeta(({ node }, { interfaces, nodeGenerator }) => {
        interfaces.push(nodeGenerator(node));
      }),

      Program: {
        exit: withMeta((path, meta, fileMeta) => {
          const output = generate(meta, fileMeta);

          //debugger;
          if (!meta.dryRun) {
            ensureDir(meta.outpath);
            fs.writeFileSync(meta.outpath, output);
          }

          //path.stop();
        })
      }
    },

    pre(file) {
      const { opts } = this;
      const meta = {};
      const {
        filename,
        moduleRoot
      } = file.opts;
      const {
        packageName,
        typings,
        suppressModulePath = false,
        suppressComments = false,
        ignoreMembers = /^_.*/,
        ignoreEmptyInterfaces = true,
        ignoreEmptyClasses = false,
        dryRun = false,
        markUnspecifiedAsOptional = true
      } = opts;

      const moduleId = `${packageName}/${relative(moduleRoot, filename).replace('.js', '')}`;
      meta.root = packageName;
      meta.moduleId = moduleId;
      meta.moduleExports = [];
      meta.moduleImports = [];
      meta.interfaces = [];
      meta.skipStack = [];
      meta.outpath = join(typings, `${moduleId}.d.ts`);
      meta.suppressModulePath = suppressModulePath;
      meta.suppressComments = suppressComments;
      meta.ignoreMembers = ignoreMembers;
      meta.ignoreEmptyInterfaces = ignoreEmptyInterfaces;
      meta.ignoreEmptyClasses = ignoreEmptyClasses;
      meta.dryRun = dryRun;
      meta.markUnspecifiedAsOptional = markUnspecifiedAsOptional;
      meta.nodeGenerator = createNodeGenerator(meta);

      file.metadata[symb] = meta;
    }
  };
}
