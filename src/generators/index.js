import { id } from './utils';
import { createModuleDeclaration } from './ast';
import { generateNode } from './dts';

export function generate({ moduleId, moduleExports, moduleImports, interfaces, root, suppressModulePath, suppressComments }, fileMeta) {
  const nodes = [...moduleImports, ...interfaces, ...moduleExports].filter(id);

  const module = createModuleDeclaration(suppressModulePath ? root : moduleId, nodes);

  fileMeta.dts = module;
  return module.toString({ suppressComments });
}

export function createNodeGenerator({ root, ignoreMembers }) {
  return generateNode({ ...createHelpers({ ignoreMembers }), root });
}

function createHelpers({ ignoreMembers }) {
  const shouldExcludeMember = (ignoreMembers => {
    if (!ignoreMembers) {
      return _ => false;
    }

    let memberType = typeof ignoreMembers;
    if (memberType !== 'function' && memberType !== 'string') {
      if (ignoreMembers instanceof RegExp) {
        memberType = 'regexp';
      }
    }

    switch (memberType) {
      case 'function':
        // memberObjectFilter is function means call function passing memberName and exclude if truthy.
        return memberName => ignoreMembers(memberName);

      case 'regexp':
        // memberObjectFilter is regex means check regex, exclude if match.
        return memberName => memberName.match(ignoreMembers);

      case 'string':
        // memberObjectFilter is string means check create regex from string, exclude if match.
        const match = (/^r\/(.*?)\/([gmi]*)$/).exec(ignoreMembers);
        const regex = match ? new RegExp(match[1], match[2]) : new RegExp(ignoreMembers);
        //console.log(`Using regex: ${regex}`);
        return memberName => memberName.match(regex);

      default:
        console.log(`warning: ignoreMembers ignored, expected type function, regexp, or string, but received type ${memberType}`);
        return () => false;
    }
  })(ignoreMembers);

  return { shouldExcludeMember };
}
