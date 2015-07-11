'use babel';
import { relative, basename, join, dirname } from 'path';
import fs from 'fs';

let meta = {};
const IGNORED = {};

export default function(babel) {
  const { Transformer, types: t } = babel;

  const skipper = {
    enter(node) {
      if (!skip()) {
        meta.moduleExports.push(node);
      }

      enterSkip(node);
    },

    exit(node) {
      exitSkip(node);
    }
  };

  return new Transformer('aurelia-babel-plugin', {
    Program: {
      enter(node, parent) {
        meta = {};
        const {filename, moduleRoot, extra: {dts: {packageName, typings, suppressModulePath = false, suppressComments = false, ignoreMembers = /^_.*/}}} = this.state.opts;
        const moduleId = packageName + '/' + relative(moduleRoot, filename).replace('.js', '');
        meta.root = packageName;
        meta.moduleId = moduleId;
        meta.moduleExports = [];
        meta.moduleImports = [];
        meta.interfaces = [];
        meta.skipStack = [];
        meta.outpath = join(typings, moduleId + '.d.ts');
        meta.suppressModulePath = suppressModulePath;
        meta.suppressComments = suppressComments;
        meta.ignoreMembers = ignoreMembers;
      },

      exit(node, parent) {
        const code = generate(meta);
        //console.log(code);
        ensureDir(meta.outpath);
        fs.writeFileSync(meta.outpath, code);
        meta = {};
      }
    },

    ExportAllDeclaration(node) {
      meta.moduleExports.push(node);
    },

    ExportNamedDeclaration: skipper,

    ExportDefaultDeclaration: skipper,

    ClassDeclaration: skipper,

    ImportDeclaration(node) {
      meta.moduleImports.push(node);
    },

    InterfaceDeclaration(node) {
      meta.interfaces.push(node);
    }
  });

  function skip() {
    return meta.skipStack.length > 0;
  }

  function enterSkip(node) {
    meta.skipStack.push(node);
  }

  function exitSkip(node) {
    if (node !== meta.skipStack.pop()) {
      throw new Error('skipStack unballance');
    }
  }
}

function generate(data) {
  const {moduleId, moduleExports, moduleImports, interfaces, root, suppressModulePath} = data;
  let str = '';
  if (suppressModulePath) {
    str = `declare module '${root}' {\n`;
  } else {
    str = `declare module '${moduleId}' {\n`;
  }
  for (let i of moduleImports) {
    let importStr = generateDts(i);
    if (importStr) {
      importStr = importStr.split('\n').map(s => `  ${s}`).join('\n');
      str += importStr + '\n';
    }
  }
  for (let i of interfaces) {
    let interfaceStr = generateDts(i);
    if (interfaceStr) {
      interfaceStr = interfaceStr.split('\n').map(s => `  ${s}`).join('\n');
      str += interfaceStr + '\n';
    }
  }
  for (let e of moduleExports) {
    let exportStr = generateDts(e);
    if (exportStr) {
      exportStr = exportStr.split('\n').map(s => `  ${s}`).join('\n');
      str += exportStr + '\n';
    }
  }
  str += '}';
  return str;
}

let exportGenerators = {
  ExportAllDeclaration(node) {
    return `${generateComment(node.leadingComments)}export * from '${getSource(node.source)}';`;
  },

  ExportNamedDeclaration(node) {
    if (node.declaration) {
      const classString = generateDts(node.declaration);
      if (classString) {
        if (classString === IGNORED) {
          return '';
        } else {
          return `${generateComment(node.leadingComments)}export ${classString}`;
        }
      } else {
        if (!shouldExcludeMember(node.declaration.id.name)) {
          console.log(`Unsupported node type ${node.declaration.type} - id: ${node.declaration.id.name}`);
        }
      }
    } else if (node.source != null) {
      const objectExports = node.specifiers.filter(s => s.type === 'ExportSpecifier')
        .map(s => {
          const {exported: {name: importName}, local: {name: localName}} = s;
          if (!localName || localName === importName)
            return importName;
          else
            return `${generateComment(node.leadingComments)}${importName} as ${localName}`;
        }).join(', ');

      return `${generateComment(node.leadingComments)}export { ${objectExports} } from '${getSource(node.source)}';`
    }
  },

  ExportDefaultDeclaration(node) {
    let value = generateDts(node.declaration);
    if (!value) {
      console.log(`Can't generate ${node.declaration.type}.`);
    }

    return `${generateComment(node.leadingComments)}export default ${value};`;
  },

  ImportDeclaration(node) {
    const objectImports = node.specifiers.filter(s => s.type === 'ImportSpecifier')
      .map(s => {
        const {imported: {name: importName}, local: {name: localName}} = s;
        if (!localName || localName === importName)
          return importName;
        else
          return `${importName} as ${localName}`;
      }).join(', ');
    const defaultImports = node.specifiers.filter(s => s.type === 'ImportDefaultSpecifier')
      .map(s => {
        const {local: {name: localName}} = s;
        return localName;
      });
    const namespaceImports = node.specifiers.filter(s => s.type === 'ImportNamespaceSpecifier')
      .map(s => {
        const {local: {name: localName}} = s;
        return `* as ${localName}`;
      });

    let parts = [...defaultImports, ...namespaceImports];
    if (objectImports.length) {
      parts.push(`{ ${objectImports} } `);
    }

    return `${generateComment(node.leadingComments)}import ${parts.join(', ')} from '${getSource(node.source)}';`;
  },

  VariableDeclaration(node) {
    let kind = node.kind;
    let hasDecl = false;
    let declarations = node.declarations.map(d => {
      const {id: {name}, typeAnnotation} = d;

      if (shouldExcludeMember(name)) {
        return '';
      }

      hasDecl = true;

      let type = 'any';
      if (typeAnnotation) {
        type = getTypeAnnotation(typeAnnotation);
      }

      return `${name}: ${type}`;
    }).join(', ');

    if (hasDecl) {
      return `${generateComment(node.leadingComments)}${kind} ${declarations};`;
    } else {
      return IGNORED;
    }
  },

  ClassDeclaration(node) {
    const {id: {name}, superClass, body} = node;
    if (shouldExcludeMember(name)) {
      return IGNORED;
    }

    let str = `${generateComment(node.leadingComments)}class ${name} `;
    if (superClass) {
      str += `extends ${superClass.name} `;
    }
    str += `{\n`;

    for (let member of body.body) {
      let memberStr = generateDts(member);
      if (memberStr) {
        memberStr = memberStr.split('\n').map(s => `  ${s}`).join('\n');
        str += memberStr + '\n';
      } else {
        if (!shouldExcludeMember(member.key.name)) {
          console.warn('missing member type: ', member.type, ' name: ', member.key.name);
        }
      }
    }

    return str + '}';
  },

  InterfaceDeclaration(node) {
    const {id: {name}, body: {indexers, properties, callProperties}, extends: e} = node;
    let extendsStr;
    if (e.length) {
      extendsStr = ' extends ' + e.map(({id: {name}}) => {
        return name;
      }).join(', ') + ' ';
    } else {
      extendsStr = '';
    }
    let str = `${generateComment(node.leadingComments)}export interface ${name}${extendsStr} {\n`;

    for (let property of properties) {
      let memberStr = generateDts(property);
      if (memberStr) {
        memberStr = memberStr.split('\n').map(s => `  ${s}`).join('\n');
        str += memberStr + '\n';
      }
    }

    for (let indexer of indexers) {
      let memberStr = generateDts(indexer);
      if (memberStr) {
        memberStr = memberStr.split('\n').map(s => `  ${s}`).join('\n');
        str += memberStr + '\n';
      }
    }

    for (let method of callProperties) {
      let memberStr = generateDts(method);
      if (memberStr) {
        memberStr = memberStr.split('\n').map(s => `  ${s}`).join('\n');
        str += memberStr + '\n';
      }
    }

    str += '}';
    //console.log(str);
    return str;
  },

  ObjectTypeIndexer(node) {
    const {id: {name}, value, key} = node;
    let type = 'any';
    let keyType = 'any';

    if (value) {
      type = getTypeAnnotationString(value);
    }

    if (key) {
      keyType = getTypeAnnotationString(key);
    }

    const staticStr = node.static ? 'static ' : '';
    return `${generateComment(node.leadingComments)}${staticStr}[${name}: ${keyType}]: ${type};`;
  },

  ObjectTypeProperty(node) {
    const {key: {name}, value} = node;
    const staticStr = node.static ? 'static ' : '';
    const optionalStr = node.optional ? '?' : '';

    if (shouldExcludeMember(name)) {
      return '';
    }

    if (value.type === 'FunctionTypeAnnotation') {
      let returnType = 'any';
      if (value.returnType) {
        returnType = getTypeAnnotationString(value.returnType);
      }

      let params = value.params.map(getFunctionTypeAnnotationParameter).join(', ');
      return `${staticStr}${name}(${params}): ${type};`;
    }

    let type = 'any';

    if (value) {
      type = getTypeAnnotationString(value);
    }

    return `${generateComment(node.leadingComments)}${staticStr}${name}${optionalStr}: ${type};`;
  },

  MethodDefinition(node) {
    const args = getArgs(node.value).join(', ');
    if (node.kind === 'constructor') {
      return `${generateComment(node.leadingComments)}constructor(${args});`
    } else {
      const {key: {name}, value: {returnType}} = node;
      let type = 'any';
      let prefix = '';

      if (shouldExcludeMember(name)) {
        return '';
      }

      if (returnType) {
        type = getTypeAnnotation(returnType);
      }

      if (node.static) {
        prefix = 'static ';
      }

      return `${generateComment(node.leadingComments)}${prefix}${name}(${args}): ${type};`;
    }
  },

  ClassProperty(node) {
    const {key: {name}, typeAnnotation} = node;
    let type = 'any';
    let prefix = '';

    if (shouldExcludeMember(name)) {
      return '';
    }

    if (node.static) {
      prefix = 'static ';
    }

    if (typeAnnotation) {
      type = getTypeAnnotation(typeAnnotation);
    }

    return `${generateComment(node.leadingComments)}${prefix}${name}: ${type};`;
  },

  NewExpression(node) {
    let args = generateArgs(node.arguments);
    return `${generateComment(node.leadingComments)}new ${node.callee.name}(${args})`;
  },

  FunctionDeclaration(node) {
    const {id: {name}, returnType} = node;
    const args = getArgs(node).join(', ');
    let type = 'any';

    if (shouldExcludeMember(name)) {
      return '';
    }

    if (returnType) {
      type = getTypeAnnotation(returnType);
    }

    return `${generateComment(node.leadingComments)}function ${name}(${args}): ${type};`;
  },

  Literal(node) {
    return node.raw;
  }
};

function generateComment(node) {
  if (meta.suppressComments || !node) {
    return '';
  }

  return '\n' + node.map(s => {
    switch (s.type) {
      case 'CommentLine': return '// ' + s.value;
      break;

      case 'CommentBlock': return '/*' + s.value + '*/'
      break;

      default:
      return '';
    }
  }).join('\n') + '\n';
}

function generateDts(node) {
  let fn = exportGenerators[node.type];
  if (fn) {
    return fn (node);
  } else {
    console.warn(`${node.type} not supported`);
  }
}

function getSource(node) {
  let {value} = node;
  if (value.substring(0, 2) === './') {
    value = meta.root + value.substring(1);
  }
  return value;
}

function generateArgs(args) {
  return args.map(arg => {
    let str = generateDts(arg);
    if (str) return str;

    return `"Unsupported argument type ${arg.type}"`;
  }).join(', ');
}

function getArg(p) {
  let name, typeAnnotation, type = 'any';
  switch (p.type) {
    case 'Identifier':
      if (p.optional) {
        name = p.name + '?';
      } else {
        name = p.name;
      }
      typeAnnotation = p.typeAnnotation;
      if (typeAnnotation) {
        type = getTypeAnnotation(typeAnnotation);
      }

      return `${name}: ${type}`;

    case 'AssignmentPattern':
      name = p.left.name;
      typeAnnotation = p.left.typeAnnotation;
      if (typeAnnotation) {
        type = getTypeAnnotation(typeAnnotation);
      }

      return `${name}?: ${type}`;

    case 'RestElement':
      name = p.argument.name;
      typeAnnotation = p.argument.typeAnnotation;
      type = 'any[]';
      if (typeAnnotation) {
        type = getTypeAnnotation(typeAnnotation);
      }

      return `...${name}: ${type}`;

    default:
      console.log(p);
      throw new Error(`Parameter type ${p.type} not implemented`);
  }
}

function getArgs(node) {
  const {params} = node;
  return params.map(getArg);
}

function getTypeAnnotation(annotated) {
  return getTypeAnnotationString(annotated.typeAnnotation);
}

function getTypeAnnotationString(annotation) {
  switch(annotation.type) {
    case 'GenericTypeAnnotation':
      const {id: {name}} = annotation;
      if (annotation.typeParameters) {
        const typeParameters = annotation.typeParameters.params.map(getTypeAnnotationString).join(', ');
        return `${name}<${typeParameters}>`;
      }

      return name;

    case 'VoidTypeAnnotation':
      return 'void';

    case 'NumberTypeAnnotation':
      return 'number';

    case 'StringTypeAnnotation':
      return 'string';

    case 'AnyTypeAnnotation':
      return 'any';

    case 'BooleanTypeAnnotation':
      return 'boolean';

    case 'UnionTypeAnnotation':
      return annotation.types.map(getTypeAnnotationString).join(' | ');

    case 'FunctionTypeAnnotation':
      const params = annotation.params.map(getFunctionTypeAnnotationParameter).join(', ');
      const returnType = getTypeAnnotationString(annotation.returnType);
      return `((${params}) => ${returnType})`;

    case 'ArrayTypeAnnotation':
      const elementType = getTypeAnnotationString(annotation.elementType);
      return `${elementType}[]`;

    default: throw new Error(`Unsupported type annotation type: ${annotation.type}`);
  }
}

function getFunctionTypeAnnotationParameter(node) {
  let {name: {name}, typeAnnotation, optional} = node;
  let type = 'any';

  if (typeAnnotation) {
    type = getTypeAnnotationString(typeAnnotation);
  }
  if (optional) {
    name = `${name}?`;
  }

  return `${name}: ${type}`;
}

function ensureDir(p) {
  const dn = dirname(p);
  if (!fs.existsSync(dn)) {
    ensureDir(dn);
    try {
      fs.mkdirSync(dn);
    } catch(e){}
  }
}

function shouldExcludeMember(memberName) {
  // memberObjectFilter falsy means include all members
  if (!meta.ignoreMembers) {
    return false;
  }

  let memberType = typeof meta.ignoreMembers;
  if (memberType != 'function' && memberType != 'string') {
    if (meta.ignoreMembers instanceof RegExp) {
      memberType = 'regexp';
    }
  }

  switch (memberType) {
    case 'function':
    // memberObjectFilter is function means call function passing memberName and exclude if truthy
    return meta.ignoreMembers(memberName);

    case 'regexp':
    // memberObjectFilter is regex means check regex, exclude if match
    return memberName.match(meta.ignoreMembers);

    case 'string':
    // memberObjectFilter is string means check create regex from string, exclude if match
    return memberName.match(new RegExp(meta.ignoreMembers));

    default:
    console.log('warning: ignoreMembers ignored, expected type function, regexp, or string, but received type ' + memberType);
    meta.ignoreMembers = null;
    return false;
  }
}
