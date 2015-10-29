import { relative, join } from 'path';
import fs from 'fs';

import { ensureDir } from './fs-utils';
import { generate } from './generators';

const symb = Symbol('dts-meta');

function withMeta(visitFn) {
  return function visit(node) {
    const meta = this.state.metadata[symb]; // eslint-disable-line no-invalid-this
    return visitFn(node, meta);
  };
}

const skipper = {
  enter: withMeta((node, { moduleExports, skipStack }) => {
    if (skipStack.length === 0) {
      moduleExports.push(node);
    }

    skipStack.push(node);
  }),

  exit: withMeta((node, { skipStack }) => {
    if (node !== skipStack.pop()) {
      throw new Error('skipStack unballance');
    }
  })
};

export function plugin({ Plugin, types: t }) { // eslint-disable-line
  return new Plugin('aurelia-babel-plugin', {
    visitor: {
      ExportAllDeclaration: withMeta((node, { moduleExports }) => {
        moduleExports.push(node);
      }),

      ExportNamedDeclaration: skipper,

      ExportDefaultDeclaration: skipper,

      ClassDeclaration: skipper,

      ImportDeclaration: withMeta((node, { moduleImports }) => {
        moduleImports.push(node);
      }),

      InterfaceDeclaration: withMeta((node, { interfaces }) => {
        interfaces.push(node);
      }),

      Program: {
        exit: withMeta((node, meta) => {
          const output = generate(meta);

          if (!meta.dryRun) {
            ensureDir(meta.outpath);
            fs.writeFileSync(meta.outpath, output);
          }
        })
      }
    },

    pre(file) {
      //console.log(file.opts);
      const meta = {};
      const {
        filename,
        moduleRoot,
        extra: {
          dts: {
            packageName,
            typings,
            suppressModulePath = false,
            suppressComments = false,
            ignoreMembers = /^_.*/,
            ignoreEmptyInterfaces = true,
            ignoreEmptyClasses = false,
            dryRun = false
          }
        }
      } = file.opts;

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
  });
}
