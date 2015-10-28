import {
  createExportAllFrom,
  createExportDeclaration,
  createVariableDeclaration,
  createVariableDeclarator,
  createExportSpecifier,
  createExport,
  createParam,
  createFunction,
  createInterface,
  createInterfaceMethod,
  createInterfaceProperty } from './ast';
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
    const { id: { name }, returnType } = node;
    if (shouldExcludeMember(name)) {
      return null;
    }

    const params = node.params.map(generateNode({ ...ctx, state: FUNCTION }));
    if (params.some(a => a === null)) {
      // There is a argument we were unable to process,
      // so we don't emit the function (as it would end up wrong).
      console.warn(`Failed processing arguments for function ${name}.`);
      return null;
    }

    const type = getTypeAnnotation(returnType, 'any');
    return createFunction(name, params, type).fromSource(node);
  },

  Identifier(node, { state }) {
    if (state !== FUNCTION) {
      return null;
    }

    const { name, typeAnnotation } = node;
    const type = getTypeAnnotation(typeAnnotation, 'any');

    return createParam(name, type).fromSource(node);
  },

  AssignmentPattern(node, { state }) {
    if (state !== FUNCTION) {
      return null;
    }

    const { left: { name, typeAnnotation } } = node;
    const type = getTypeAnnotation(typeAnnotation, 'any');

    return createParam(name, `${type}?`).fromSource(node);
  },

  RestElement(node, { state }) {
    if (state !== FUNCTION) {
      return null;
    }

    const { argument: { name }, typeAnnotation } = node;
    const type = getTypeAnnotation(typeAnnotation, 'any[]');

    return createParam(name, type, true).fromSource(node);
  },

  InterfaceDeclaration(node, ctx) {
    const { ignoreEmptyInterfaces } = ctx;
    const { id: { name }, body: { indexers, properties, callProperties }, extends: e } = node;
    const baseInterfaces = e.map(({ id: { name } }) => name);
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
      if (method !== null) {
        members.push(member);
      }
    }

    if (ignoreEmptyInterfaces && baseInterfaces.length === 0 && members.length === 0) {
      return null;
    }

    return createInterface(name, members, baseInterfaces).fromSource(node);
  },

  ObjectTypeProperty(node, ctx) {
    const { shouldExcludeMember } = ctx;
    const { key: { name }, value, static: isStatic, optional } = node;

    if (shouldExcludeMember(name)) {
      return null;
    }

    if (value.type === 'FunctionTypeAnnotation') {
      const { params: p, returnType, rest } = value;
      // There is no way to differeantiate foo: () => void; and
      // foo(): void in interfaces in the babel AST (at least that
      // I've found). Thus these are treated as methods.
      const params = p.map(getFunctionTypeAnnotationParameterNode);
      if (rest) {
        params.push(getFunctionTypeAnnotationParameterNode(rest).asRestParam());
      }

      const type = getTypeAnnotationString(returnType, 'any');
      return createInterfaceMethod(name, params, type, isStatic || false, optional).fromSource(node);
    }

    const type = getTypeAnnotationString(value, 'any');
    return createInterfaceProperty(name, type, isStatic || false, optional);
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
    if (!meta.ignoreMembers) {
      return false;
    }

    let memberType = typeof meta.ignoreMembers;
    if (memberType !== 'function' && memberType !== 'string') {
      if (meta.ignoreMembers instanceof RegExp) {
        memberType = 'regexp';
      }
    }

    switch (memberType) {
      case 'function':
        // memberObjectFilter is function means call function passing memberName and exclude if truthy.
        return meta.ignoreMembers(memberName);

      case 'regexp':
        // memberObjectFilter is regex means check regex, exclude if match.
        return memberName.match(meta.ignoreMembers);

      case 'string':
        // memberObjectFilter is string means check create regex from string, exclude if match.
        return memberName.match(new RegExp(meta.ignoreMembers));

      default:
        console.log(`warning: ignoreMembers ignored, expected type function, regexp, or string, but received type ${memberType}`);
        meta.ignoreMembers = null;
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

  return createParam(name, optional ? `${type}?` : type);
}
