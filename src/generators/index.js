import { id } from './utils';
import { createModuleDeclaration } from './ast';
import { generateNode } from './dts';

export function generate({ moduleId, moduleExports, moduleImports, interfaces, root, suppressModulePath, suppressComments }) {
  const nodes = moduleImports.concat(interfaces, moduleExports)
    .map(generateNode({ root }))
    .filter(id);

  const module = createModuleDeclaration(suppressModulePath ? root : moduleId, nodes);

  return module.toString({ suppressComments });
}
