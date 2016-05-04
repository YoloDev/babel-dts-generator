import { id } from './utils';
import { createModuleDeclaration } from './ast';
import { generateNode } from './dts';

export function generate({
    moduleId,
    moduleExports,
    moduleImports,
    interfaces,
    root,
    suppressModulePath,
    suppressComments,
    markUnspecifiedAsOptional
  }, fileMeta) {
  const nodes = moduleImports.concat(interfaces, moduleExports).filter(id);

  const module = createModuleDeclaration(suppressModulePath ? root : moduleId, nodes);

  fileMeta.dts = module;
  return module.toString({ suppressComments, markUnspecifiedAsOptional });
}

export function createNodeGenerator({ root }) {
  return generateNode({ root });
}
