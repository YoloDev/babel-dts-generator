import { relative, join } from 'path';
import fs from 'fs';

import { ensureDir } from './fs-utils';
import { generate } from './generators';

const symb = Symbol('dts-meta');

function withMeta(visitFn) {
  return function visit(path, { file: { metadata } }) {
    const meta = metadata[symb];
    return visitFn(path, meta);
  };
}

const skipper = {
  enter: withMeta((path, { moduleExports, skipStack }) => {
    if (skipStack.length === 0) {
      moduleExports.push(path.node);
    }

    skipStack.push(path);
  }),

  exit: withMeta((path, { skipStack }) => {
    if (path !== skipStack.pop()) {
      throw new Error('skipStack unballance');
    }
  })
};

export function plugin({ types: t }) { // eslint-disable-line
  return {
    visitor: {
      ExportAllDeclaration: withMeta(({ node }, { moduleExports }) => {
        moduleExports.push(node);
      }),

      ExportNamedDeclaration: skipper,

      ExportDefaultDeclaration: skipper,

      ClassDeclaration: skipper,

      ImportDeclaration: withMeta(({ node }, { moduleImports }) => {
        moduleImports.push(node);
      }),

      InterfaceDeclaration: withMeta(({ node }, { interfaces }) => {
        interfaces.push(node);
      }),

      Program: {
        exit: withMeta(({ node }, meta) => {
          const output = generate(meta);

          if (!meta.dryRun) {
            ensureDir(meta.outpath);
            fs.writeFileSync(meta.outpath, output);
          }
        })
      }
    },

    pre(file, { opts }) {
      //console.log(file.opts);
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
        dryRun = false
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

      file.metadata[symb] = meta;
    }
  };
}
