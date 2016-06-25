import {
  createExportAllFrom,
  createExportDeclaration,
  createImportDeclaration,
  createVariableDeclaration,
  createVariableDeclarator,
  createExportSpecifier,
  createExport,
  createImportSpecifier,
  createImportDefaultSpecifier,
  createImportNamespaceSpecifier,
  createImport,
  createParam,
  createFunction,
  createInterface,
  createInterfaceMethod,
  createInterfaceProperty,
  createInterfaceIndexer,
  createInterfaceCall,
  createClass,
  createImplements,
  createClassConstructor,
  createClassMethod,
  createClassProperty } from './ast';
import { id } from './utils';

const ROOT = 'root';
const FUNCTION = 'func';
const INTERFACE = 'iface';
const CLASS = 'class';

const generators = {
  ExportAllDeclaration(node, { root }) {
    const source = getSource(node.source, root);
    return createExportAllFrom(source).fromSource(node);
  },

  ExportNamedDeclaration(node, { root, generate }) {
    if (node.declaration) {
      // This is an export of the kinds
      // * export class Foo {}
      // * export const bar;
      // * export function baz() {}
      const member = generate(node.declaration);

      if (member === null) {
        return null;
      }

      return createExportDeclaration(member).fromSource(node);
    } else if (node.source) {
      // This is a re-export of the kind
      // export { foo, bar as baz } from 'bar';

      const source = getSource(node.source, root);
      const specifiers = node.specifiers.map(generate).filter(id);

      if (specifiers.length === 0) {
        return null;
      }

      return createExport(specifiers, source).fromSource(node);
    } else if (node.specifiers) {
      // This is an export of the kind
      // export { foo, bar as baz };

      const specifiers = node.specifiers.map(generate).filter(id);

      if (specifiers.length === 0) {
        return null;
      }

      return createExport(specifiers, null).fromSource(node);
    }

    console.warn('Unknown export named declaration format');
    return null;
  },

  ImportDeclaration(node, { generate }) {
    if (node.specifiers) {
      const importSpecifiers = node.specifiers.filter(s => s.type === 'ImportSpecifier').map(generate);

      if (importSpecifiers.length === 0) {
        const importOtherSpecifiers = node.specifiers.filter(s => s.type !== 'ImportSpecifier').map(generate);

        if (importOtherSpecifiers.length === 0) {
          return createImportDeclaration(node).fromSource(node);
        }

        // for this case, the specifiers should not be enclosed in {}
        //   import q from 'bat';
        //   import * as foons from 'bun';
        return createImport(false, importOtherSpecifiers, node.source.value).fromSource(node);
      }

      // for this case, the specifiers should be enclosed in {}
      //   import {x} from 'bar';
      //   import {y,z as w} from 'baz';
      //   import {default as q2} from 'bat';
      return createImport(true, importSpecifiers, node.source.value).fromSource(node);
    }

    return createImportDeclaration(node).fromSource(node);
  },

  ImportSpecifier(node) {
    const local = node.local.name;
    const imported = node.imported.name;

    return createImportSpecifier(imported, local).fromSource(node);
  },

  ImportDefaultSpecifier(node) {
    const local = node.local.name;

    return createImportDefaultSpecifier(local).fromSource(node);
  },

  ImportNamespaceSpecifier(node) {
    const local = node.local.name;

    return createImportNamespaceSpecifier(local).fromSource(node);
  },

  VariableDeclaration(node, { generate }) {
    const { kind } = node;
    const declarations = node.declarations.map(generate).filter(id);

    if (declarations.length === 0) {
      return null;
    }

    return createVariableDeclaration(kind, declarations).fromSource(node);
  },

  VariableDeclarator(node, { shouldExcludeMember }) {
    const { id: { name, typeAnnotation } } = node;

    if (shouldExcludeMember(name)) {
      return null;
    }

    const type = getTypeAnnotation(typeAnnotation, 'any');

    return createVariableDeclarator(name, type).fromSource(node);
  },

  ExportSpecifier(node, { shouldExcludeMember }) {
    const local = node.local.name;
    const exported = node.exported.name;

    if (shouldExcludeMember(exported) || local && shouldExcludeMember(local)) {
      return null;
    }

    return createExportSpecifier(local, exported).fromSource(node);
  },

  FunctionDeclaration(node, ctx) {
    const { shouldExcludeMember } = ctx;
    const { id: { name }, returnType, params: p, typeParameters: tp } = node;
    if (shouldExcludeMember(name)) {
      return null;
    }

    const params = p.map(generateNode({ ...ctx, state: FUNCTION }));
    if (params.some(a => a === null)) {
      // There is a argument we were unable to process,
      // so we don't emit the function (as it would end up wrong).
      console.warn(`Failed processing arguments for function ${name}.`);
      return null;
    }

    const type = getTypeAnnotation(returnType);
    const typeParameters = getTypeParameters(tp);
    return createFunction(name, params, type, typeParameters).fromSource(node);
  },

  Identifier(node, { state }) {
    if (state !== FUNCTION) {
      return null;
    }

    const { name, typeAnnotation, optional } = node;
    const type = getTypeAnnotation(typeAnnotation);

    return createParam(name, type, { isOptional: optional }).fromSource(node);
  },

  AssignmentPattern(node, { state }) {
    if (state !== FUNCTION) {
      return null;
    }

    const { left: { name, typeAnnotation } } = node;
    const type = getTypeAnnotation(typeAnnotation);

    return createParam(name, type, { isOptional: true }).fromSource(node);
  },

  RestElement(node, { state }) {
    if (state !== FUNCTION) {
      return null;
    }

    const { argument: { name }, typeAnnotation } = node;
    const type = getTypeAnnotation(typeAnnotation);

    return createParam(name, type, { isRest: true }).fromSource(node);
  },

  InterfaceDeclaration(node, ctx) {
    const { ignoreEmptyInterfaces, shouldExcludeMember } = ctx;
    const { id: { name }, body: { indexers, properties, callProperties }, extends: e, typeParameters: tp } = node;
    const baseInterfaces = e.map(({ id: { name } }) => name);
    const typeParameters = getTypeParameters(tp);
    const members = [];

    const generate = generateNode({ ...ctx, state: INTERFACE });

    for (const property of properties) {
      const member = generate(property);
      if (member !== null) {
        members.push(member);
      }
    }

    for (const indexer of indexers) {
      const member = generate(indexer);
      if (member !== null) {
        members.push(member);
      }
    }

    for (const method of callProperties) {
      const member = generate(method);
      if (member !== null) {
        members.push(member);
      }
    }

    if (shouldExcludeMember(name)) {
      return null;
    }

    if (ignoreEmptyInterfaces && baseInterfaces.length === 0 && members.length === 0) {
      return null;
    }

    return createInterface(name, members, baseInterfaces, typeParameters).fromSource(node);
  },

  ObjectTypeProperty(node, ctx) {
    const { shouldExcludeMember } = ctx;
    const { key: { name }, value, static: isStatic, optional } = node;

    if (shouldExcludeMember(name)) {
      return null;
    }

    if (value.type === 'FunctionTypeAnnotation') {
      const { params: p, returnType, rest, typeParameters: tp } = value;
      // There is no way to differeantiate foo: () => void; and
      // foo(): void in interfaces in the babel AST (at least that
      // I've found). Thus these are treated as methods.
      const params = p.map(getFunctionTypeAnnotationParameterNode);
      if (rest) {
        params.push(getFunctionTypeAnnotationParameterNode(rest).asRestParam());
      }

      const type = getTypeAnnotationString(returnType);
      const typeParameters = getTypeParameters(tp);
      return createInterfaceMethod(name, params, type, typeParameters, isStatic || false, optional).fromSource(node);
    }

    const type = getTypeAnnotationString(value);
    return createInterfaceProperty(name, type, isStatic || false, optional).fromSource(node);
  },

  ObjectTypeIndexer(node) {
    const { id: { name }, value, key } = node;

    const type = getTypeAnnotationString(value);
    const keyType = getTypeAnnotationString(key);

    return createInterfaceIndexer(name, keyType, type).fromSource(node);
  },

  ObjectTypeCallProperty(node) {
    const { value } = node;

    const { params: p, returnType, rest } = value;
    // There is no way to differeantiate foo: () => void; and
    // foo(): void in interfaces in the babel AST (at least that
    // I've found). Thus these are treated as methods.
    const params = p.map(getFunctionTypeAnnotationParameterNode);
    if (rest) {
      params.push(getFunctionTypeAnnotationParameterNode(rest).asRestParam());
    }

    const type = getTypeAnnotationString(returnType);
    return createInterfaceCall(params, type).fromSource(node);
  },

  ClassDeclaration(node, ctx) {
    const { shouldExcludeMember, ignoreEmptyClasses } = ctx;
    const { id: { name }, superClass, body, typeParameters: tp, superTypeParameters: stp, implements: impl } = node;
    if (shouldExcludeMember(name)) {
      return null;
    }

    if (superClass && superClass.type !== 'Identifier') {
      console.warn('Only identifiers supported for super classes.');
      return null;
    }

    const generate = generateNode({ ...ctx, state: CLASS });
    const superName = superClass ? superClass.name : null;
    const members = body.body.map(generate).filter(id);
    const typeParameters = getTypeParameters(tp);
    const superTypeParameters = getTypeParameters(stp);
    const impls = impl ? impl.map(generate) : null;

    if (members.length === 0 && ignoreEmptyClasses) {
      return null;
    }

    return createClass(name, superName, members, typeParameters, superTypeParameters, impls).fromSource(node);
  },

  ClassImplements(node, _ctx) {
    const { id: { name }, typeParameters: tp } = node;
    const typeParameters = getTypeParameters(tp);

    return createImplements(name, typeParameters).fromSource(node);
  },

  ClassMethod(node, ctx) {
    const { shouldExcludeMember } = ctx;
    const { kind, computed, returnType, params: p, typeParameters: tp, static: isStatic, key: n } = node;

    const params = p.map(generateNode({ ...ctx, state: FUNCTION }));
    if (params.some(a => a === null)) {
      // There is a argument we were unable to process,
      // so we don't emit the function (as it would end up wrong).
      console.warn(`Failed processing arguments for function ${name}.`);
      return null;
    }

    if (kind === 'constructor') {
      return createClassConstructor(params).fromSource(node);
    }

    const type = getTypeAnnotation(returnType);
    const typeParameters = getTypeParameters(tp);
    let name;
    switch (n.type) {
      case 'Identifier':
        if (shouldExcludeMember(n.name, { computed })) {
          return null;
        }

        name = computed ? `[${n.name}]` : n.name;
        break;

      case 'StringLiteral':
        if (shouldExcludeMember(n.value, { computed })) {
          return null;
        }

        name = n.extra.raw;
        break;

      default:
        console.warn(`Invalid method name type ${n.type}`);
        return null;
    }

    if (node.kind === 'set') {
      // ignore setters
      return null;
    }

    if (node.kind === 'get') {
      return createClassProperty(name, type, isStatic).fromSource(node);
    }

    return createClassMethod(name, params, type, typeParameters, isStatic).fromSource(node);
  },

  ClassProperty(node, ctx) {
    const { key: { name }, typeAnnotation, static: isStatic } = node;
    const { shouldExcludeMember } = ctx;
    if (shouldExcludeMember(name)) {
      return null;
    }

    const type = getTypeAnnotation(typeAnnotation);
    return createClassProperty(name, type, isStatic).fromSource(node);
  }
};

export function generateNode(meta) {
  if (!meta.state) {
    meta = { ...meta, state: ROOT };
  }

  function generate(node) {
    const fn = generators[node.type];

    if (fn) {
      return fn(node, { generate, shouldExcludeMember, ...meta });
    }

    console.warn(`${node.type} not supported.`);
    return null;
  }

  function shouldExcludeMember(memberName) {
    // memberObjectFilter falsy means include all members
    let ignoreMembers = '^_.*';
    if (meta && meta.ignoreMembers) {
      ignoreMembers = meta.ignoreMembers;
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
        return ignoreMembers(memberName);

      case 'regexp':
        // memberObjectFilter is regex means check regex, exclude if match.
        return memberName.match(ignoreMembers);

      case 'string':
        // memberObjectFilter is string means check create regex from string, exclude if match.
        return memberName.match(new RegExp(ignoreMembers));

      default:
        console.log(`warning: ignoreMembers ignored, expected type function, regexp, or string, but received type ${memberType}`);
        ignoreMembers = null;
        return false;
    }
  }

  return generate;
}

function getSource(node, root) {
  let { value } = node;
  if (value.substring(0, 2) === './') {
    value = root + value.substring(1);
  }

  return value;
}

function getTypeParameters(typeParameters) {
  if (!typeParameters) {
    return null;
  }

  const { type, params } = typeParameters;
  if (params.length === 0) {
    return null;
  }

  switch (type) {
    case 'TypeParameterDeclaration':
      return params.map(id => id.name);

    case 'TypeParameterInstantiation':
      return params.map(n => getTypeAnnotationString(n, null));

    default:
      return null;
  }
}

/**
 * @param  {any} annotated the node to get annotation from
 * @param  {string} [defaultType=null] the default type to use if no annotation is found
 */
function getTypeAnnotation(annotated, defaultType = null) {
  if (!annotated) {
    return defaultType;
  }

  return getTypeAnnotationString(annotated.typeAnnotation, defaultType);
}

function getTypeAnnotationString(annotation, defaultType = 'any') {
  if (!annotation) {
    return defaultType;
  }

  switch (annotation.type) {
    case 'GenericTypeAnnotation':
      const { id: { name } } = annotation;
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

    case 'TupleTypeAnnotation':
      const elements = annotation.types.map(getTypeAnnotationString).join(', ');
      return `[${elements}]`;

    case 'ObjectTypeAnnotation':
      const { properties, indexers } = annotation;
      const annotations =
        properties.map(({ key: { name }, value }) => {
          const valueType = getTypeAnnotationString(value);

          return `${name}: ${valueType}`;
        }).concat(indexers.map(({ id: { name }, key, value }) => {
          const keyType = getTypeAnnotationString(key);
          const valueType = getTypeAnnotationString(value);

          return `[${name}: ${keyType}]: ${valueType}`;
        }));

      if (annotations.length === 0) {
        return '{}';
      }

      const annotationsString = annotations.join(', ');

      return `{ ${annotationsString} }`;

    default: throw new Error(`Unsupported type annotation type: ${annotation.type}`);
  }
}

function getFunctionTypeAnnotationParameter(node) {
  const { name: { name }, typeAnnotation, optional } = node;
  const type = getTypeAnnotationString(typeAnnotation, 'any');

  return `${name}${optional ? '?' : ''}: ${type}`;
}

function getFunctionTypeAnnotationParameterNode(node) {
  const { name: { name }, typeAnnotation, optional } = node;
  const type = getTypeAnnotationString(typeAnnotation, 'any');

  return createParam(name, type, { isOptional: optional });
}
