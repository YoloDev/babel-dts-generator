import { id, factory, findLastIndex } from './utils';

class Node {
  constructor() {
    this._leadingComments = null;
  }

  fromSource(node) {
    this._leadingComments = node.leadingComments || null;

    return this;
  }

  toCode(ctx) {
    const output = `${this._getCommentString(ctx)}${this._toCode(ctx)}`;

    return output
      .split('\n')
      .map(indent(ctx))
      .join('\n');
  }

  toString(ctx = {}) {
    return this.toCode({ ...emptyCtx(), ...ctx });
  }

  _getCommentString({ suppressComments }) {
    if (suppressComments) {
      return '';
    }

    const comments = this._leadingComments ?
      this._leadingComments.filter(id).map(s => {
        switch (s.type) {
          case 'CommentLine':
            return `//${s.value}`.trim();

          case 'CommentBlock':
            return `/*${s.value}*/`.trim();

          default:
            return null;
        }
      }).filter(id).join('\n') : '';

    return comments.length === 0 ? '' : `\n${comments}\n`;
  }

  // Note: _toCode is not expected to indent itself, only children.
  _toCode() {
    throw new Error('toCode is abstract.');
  }

  _includeComments() {
    return true;
  }
}

class DecorableNode extends Node {
  fromSource(node) {
    let decoLeadingComments = [];
    if (node.decorators) {
      const all = node.decorators.map(n => n.leadingComments);
      decoLeadingComments = [].concat(...all);
    }

    this._leadingComments = decoLeadingComments.concat(node.leadingComments || []);

    return this;
  }
}

@factory
class ModuleDeclarationNode extends Node {
  constructor(name, children) {
    super();

    this._name = name;
    this._children = children;
  }

  _toCode(ctx) {
    const code = ctx.suppressAmbientDeclaration ?
      this._children.map(toCode(ctx)).join('\n') :
      this._children.map(toCode(ctx.indent())).join('\n');
    return ctx.suppressAmbientDeclaration ?
      code :
      `declare module '${this._name}' {\n${code}\n}`;
  }
}

@factory
class ExportAllFromNode extends Node {
  constructor(source) {
    super();

    this._source = source;
  }

  _toCode() {
    return `export * from '${this._source}';`;
  }
}

@factory
class ExportNamedDeclarationNode extends Node {
  constructor(declaration) {
    super();

    this._declaration = declaration;
  }

  _toCode(ctx) {
    const comment = this._declaration._getCommentString(ctx);
    const decl = this._declaration._toCode(ctx);
    const suffix = this._declaration.preventSemi ? '' : ';';

    return `${comment}export${ctx.suppressAmbientDeclaration ? ' declare' : ''} ${decl}${suffix}`;
  }
}

@factory
class ImportDeclarationNode extends Node {
  constructor(decl) {
    super();
    this._source = decl.source.value;
  }

  _toCode(_ctx) {
    const source = this._source;
    return `import '${source}';`;
  }
}

@factory
class VariableDeclarationNode extends Node {
  constructor(kind, declarations) {
    super();

    this._kind = kind;
    this._declarations = declarations;
  }

  _toCode(ctx) {
    const kind = this._kind;
    let declarations = this._declarations.map(toCode({ ...ctx, level: 0 })).filter(id);
    if (declarations.length === 0) {
      return null;
    }

    if (declarations.length > 1) {
      const extraIndent = ctx.multiVarStep;

      const doIndent = indent({ level: 1, step: extraIndent });
      declarations = declarations.map((dec, i) => {
        if (i === 0) {
          return dec;
        }

        return doIndent(dec);
      });
    }

    const decCode = declarations.join(',\n');

    return `${kind} ${decCode}`;
  }
}

@factory
class VariableDeclaratorNode extends Node {
  constructor(name, type) {
    super();

    this._name = name;
    this._type = type;
  }

  _toCode() {
    return `${this._name}: ${this._type}`;
  }
}

@factory
class ExportSpecifierNode extends Node {
  constructor(exported, local) {
    super();

    this._exported = exported;
    this._local = local;
  }

  _toCode() {
    if (!this._local || this._local === this._exported) {
      return `${this._exported}`;
    }

    return `${this._exported} as ${this._local}`;
  }
}

@factory
class ExportNode extends Node {
  constructor(exported, source) {
    super();

    this._exported = exported;
    this._source = source;
  }

  _toCode(ctx) {
    const exported = this._exported.map(toCode({ ...ctx, level: 1 })).join(',\n');

    if (this._source) {
      return `export${ctx.suppressAmbientDeclaration ? ' declare' : ''} {\n${exported}\n} from '${this._source}';`;
    }

    return `export${ctx.suppressAmbientDeclaration ? ' declare' : ''} {\n${exported}\n};`;
  }
}

@factory
class ImportSpecifierNode extends Node {
  constructor(imported, local) {
    super();

    this._imported = imported;
    this._local = local;
  }

  _toCode() {
    if (!this._local || this._local === this._imported) {
      return `${this._imported}`;
    }

    return `${this._imported} as ${this._local}`;
  }
}

@factory
class ImportDefaultSpecifierNode extends Node {
  constructor(local) {
    super();

    this._local = local;
  }

  _toCode() {
    return `${this._local}`;
  }
}

@factory
class ImportNamespaceSpecifierNode extends Node {
  constructor(local) {
    super();

    this._local = local;
  }

  _toCode() {
    return `* as ${this._local}`;
  }
}

@factory
class ImportNode extends Node {
  constructor(encloseSpecifiers, specifiers, source) {
    super();

    this._specifiers = specifiers;
    this._encloseSpecifiers = encloseSpecifiers;
    this._source = source;
  }

  _toCode(ctx) {
    let specifiers = null;

    if (this._encloseSpecifiers) {
      specifiers = this._specifiers.map(toCode({ ...ctx, level: 1 })).join(',\n');
      if (this._source) {
        return `import {\n${specifiers}\n} from '${this._source}';`;
      }

      return `import {\n${specifiers}\n};`;
    }

    specifiers = this._specifiers.map(toCode({ ...ctx, level: 0 })).join(',\n');
    if (this._source) {
      return `import ${specifiers} from '${this._source}';`;
    }

    return `import ${specifiers};`;
  }
}

@factory
class ParameterNode extends Node {
  constructor(name, type, isRest, isOptional) {
    super();

    this._name = name;
    this._type = type;
    this._isRest = isRest;
    this._isOptional = isOptional;
  }

  asRestParam() {
    if (this._isRest) {
      return this;
    }

    return new ParameterNode(this._name, this._type, true, this._isOptional);
  }

  asOptional() {
    if (this._isOptional) {
      return this;
    }

    return new ParameterNode(this._name, this._type, this._isRest, true);
  }

  _includeComments() {
    return false;
  }

  _toCode({ unspecifiedAsOptional = false }) {
    const type = this.type;
    const optional = unspecifiedAsOptional && this._type === null && !this._isRest || this._isOptional;
    return `${this._isRest ? '...' : ''}${this._name}${optional ? '?' : ''}: ${type}`;
  }

  get type() {
    if (this._type) {
      return this._type;
    }

    if (this._isRest) {
      return 'any[]';
    }

    return 'any';
  }

  get isSpecified() {
    return this._type !== null;
  }
}

@factory
class ObjectParameterNode extends Node {
  constructor(properties, type, isOptional) {
    super();

    this._props = properties;
    this._type = type;
    this._isOptional = isOptional;
  }

  asOptional() {
    if (this._isOptional) {
      return this;
    }

    return new ObjectParameterNode(this._props, this._type, true);
  }

  _toCode(ctx) {
    if (this._props.length === 0) {
      return '{}: {}';
    }

    const { unspecifiedAsOptional = false } = ctx;
    const propStr = this.getIdent(ctx);
    const type = this.getType(ctx);
    const optional = unspecifiedAsOptional && this._type === null || this._isOptional;

    return `${propStr}${optional ? '?' : ''}: ${type}`;
  }

  getIdent(ctx) {
    if (this._props.length === 0) {
      return '{}';
    }

    const props = this._props.map(prop =>
      prop.toCode({ ...ctx, level: 0 })
        .split('\n')
        .map(indent({ ...ctx, level: 1 }))
        .join('\n'))
      .join(`,\n`);

    return `{\n${props}\n}`;
  }

  getType(ctx) {
    if (this._type) {
      return this._type;
    }

    if (this._props.length === 0) {
      return '{}';
    }

    const propTypes = this._props.map(prop =>
      prop.getTypeString({ ...ctx, level: 0 })
        .split('\n')
        .map(indent({ ...ctx, level: 1 }))
        .join('\n'))
      .join(',\n');

    return indent(ctx)(`{\n${propTypes}\n}`);
  }

  get isSpecified() {
    return this._type !== null;
  }
}

@factory
class ObjectParameterPropertyNode extends Node {
  constructor(key, value, isOptional) {
    super();

    this._key = key;
    this._value = value;
    this._isOptional = isOptional;
  }

  _toCode(ctx) {
    const childCtx = { ...ctx, level: 0 };
    const prop = this._value === null ? this._key : `${this.key}: ${this._value.getIdent(childCtx)}`;

    return prop;
  }

  getTypeString(ctx) {
    const { unspecifiedAsOptional = false } = ctx;
    const prefix = unspecifiedAsOptional ? `${this.key}?` : this.key;

    if (this._value === null) {
      return `${prefix}: any`;
    }

    const childCtx = { ...ctx, level: 0 };
    const valueStr = this._value.getType(childCtx);
    return `${prefix}: ${valueStr}`;
  }

  get key() {
    return this._key;
  }
}

@factory
class MethodNode extends DecorableNode {
  constructor(name, params, type, typeParameters) {
    super();

    this._name = name;
    this._params = params;
    this._type = type;
    this._typeParameters = typeParameters;
  }

  get name() {
    return this._name;
  }

  _toCode(ctx) {
    const lastSpecified = findLastIndex(this._params, p => p.isSpecified);
    const markUnspecifiedAsOptional = ctx.markUnspecifiedAsOptional;
    const childCtx = { ...ctx, level: 0 };
    const params = this._params.map((param, index) =>
      param._toCode({ ...childCtx, unspecifiedAsOptional: markUnspecifiedAsOptional && index > lastSpecified })
    ).join(', ');

    const type = this.type === null ? '' : `: ${this.type}`;
    const typeParameters = this._typeParameters !== null ? `<${this._typeParameters.join(', ')}>` : '';

    return `${this.name || ''}${typeParameters}(${params})${type}`;
  }

  get isConstructor() {
    return false;
  }

  get type() {
    if (this.isConstructor) {
      return null;
    }

    if (this._type) {
      return this._type;
    }

    return 'any';
  }
}

@factory
class FunctionNode extends MethodNode {
  constructor(name, params, type, typeParameters) {
    super(name, params, type, typeParameters);
  }

  _toCode(ctx) {
    return `function ${super._toCode(ctx)}`;
  }
}

@factory
class InterfaceNode extends Node {
  constructor(name, members, baseInterfaces, typeParameters) {
    super();

    this._name = name;
    this._members = members;
    this._baseInterfaces = baseInterfaces;
    this._typeParameters = typeParameters;
  }

  _toCode(ctx) {
    const members = this._members.map(toCode({ ...ctx, level: 1 })).join('\n');
    const baseInterfaces = this._baseInterfaces.map(toCode({ ...ctx, level: 0 })).join(', ');
    const extendsStr = baseInterfaces.length === 0 ? '' : ` extends ${baseInterfaces}`;
    const typeParameters = this._typeParameters !== null ? `<${this._typeParameters.join(', ')}>` : '';
    const decl = ctx.suppressAmbientDeclaration ? ' declare' : '';

    return `export${decl} interface ${this._name}${typeParameters}${extendsStr} {\n${members}\n}`;
  }
}

@factory
class InterfaceCallNode extends MethodNode {
  constructor(params, type) {
    super(null, params, type, null);
  }

  _toCode(ctx) {
    return `${super._toCode(ctx)};`;
  }
}

@factory
class InterfaceMethodNode extends MethodNode {
  constructor(name, params, type, typeParameters, isStatic, isOptional) {
    super(name, params, type, typeParameters);

    this._static = isStatic;
    this._optional = isOptional;
  }

  get name() {
    return this._optional ? `${super.name}?` : super.name;
  }

  _toCode(ctx) {
    const prefix = this._static ? 'static ' : '';

    if (this._optional) {
      const params = this._params.map(toCode({ ...ctx, level: 0 })).join(', ');
      const type = this._type !== null ? ` => ${this._type}` : '';

      return `${prefix}${this.name || ''}: (${params})${type};`;
    }

    return `${prefix}${super._toCode(ctx)};`;
  }
}

@factory
class InterfacePropertyNode extends Node {
  constructor(name, type, isStatic, isOptional) {
    super();

    this._name = name;
    this._type = type;
    this._static = isStatic;
    this._optional = isOptional;
  }

  _toCode() {
    const prefix = this._static ? 'static ' : '';
    const name = this._optional ? `${this._name}?` : this._name;

    return `${prefix}${name}: ${this._type};`;
  }
}

@factory
class InterfaceIndexerNode extends Node {
  constructor(name, keyType, returnType) {
    super();

    this._name = name;
    this._keyType = keyType;
    this._returnType = returnType;
  }

  _toCode() {
    return `[${this._name}: ${this._keyType}]: ${this._returnType};`;
  }
}

@factory
class ClassNode extends DecorableNode {
  constructor(name, superName, members, typeParameters, superTypeParameters, impls) {
    super();

    this._name = name;
    this._super = superName;
    this._members = members;
    this._typeParameters = typeParameters;
    this._superTypeParameters = superTypeParameters;
    this._impls = impls;
  }

  _toCode(ctx) {
    const members = this._members.map(toCode({ ...ctx, level: 1 })).join('\n');
    const superTypeParameters = this._superTypeParameters !== null ? `<${this._superTypeParameters.join(', ')}>` : '';
    const superStr = this._super ? ` extends ${this._super}${superTypeParameters}` : '';
    const typeParameters = this._typeParameters !== null ? `<${this._typeParameters.join(', ')}>` : '';
    const impls = this._impls !== null ? ` implements ${this._impls.map(toCode({ ...ctx, level: 0 })).join(', ')}` : '';

    return `class ${this._name}${typeParameters}${superStr}${impls} {\n${members}\n}`;
  }

  get preventSemi() {
    return true;
  }
}

@factory
class ImplementsNode extends Node {
  constructor(name, typeParameters) {
    super();

    this._name = name;
    this._typeParameters = typeParameters;
  }

  _toCode(_ctx) {
    const name = this._name;
    const typeParameters = this._typeParameters !== null ? `<${this._typeParameters.join(', ')}>` : '';

    return `${name}${typeParameters}`;
  }
}

@factory
class ClassMethodNode extends MethodNode {
  constructor(name, params, type, typeParameters, isStatic) {
    super(name, params, type, typeParameters);

    this._static = isStatic;
  }

  _toCode(ctx) {
    const prefix = this._static ? 'static ' : '';

    return `${prefix}${super._toCode(ctx)};`;
  }
}

@factory
class ClassConstructorNode extends ClassMethodNode {
  constructor(params) {
    super('constructor', params, null, null);
  }

  get isConstructor() {
    return true;
  }
}

@factory
class ClassPropertyNode extends Node {
  constructor(name, type, isStatic) {
    super();

    this._name = name;
    this._type = type;
    this._static = isStatic;
  }

  _toCode() {
    const prefix = this._static ? 'static ' : '';

    return `${prefix}${this._name}: ${this.type};`;
  }

  get type() {
    return this._type || 'any';
  }
}

function indent({ level, step }) {
  if (level === 0) {
    return id;
  }

  let result = step;
  for (let i = 1; i < indent; i++) {
    result += step;
  }

  return source => result + source;
}

function emptyCtx() {
  return Object.freeze({
    level: 0,
    step: '  ',
    multiVarStep: '  ',
    indent() {
      return Object.freeze({ ...this, level: this.level + 1 });
    }
  });
}

function toCode(ctx) {
  return (node) => node.toCode(ctx);
}

export function createModuleDeclaration(name, nodes) {
  return ModuleDeclarationNode(name, nodes);
}

export function createExportAllFrom(source) {
  return ExportAllFromNode(source);
}

export function createExportDeclaration(decl) {
  return ExportNamedDeclarationNode(decl);
}

export function createImportDeclaration(decl) {
  return ImportDeclarationNode(decl);
}

export function createVariableDeclaration(kind, decs) {
  return VariableDeclarationNode(kind, decs);
}

export function createVariableDeclarator(name, type) {
  return VariableDeclaratorNode(name, type);
}

export function createExportSpecifier(exported, local) {
  return ExportSpecifierNode(exported, local);
}

export function createExport(specifiers, source) {
  return ExportNode(specifiers, source);
}

export function createImportSpecifier(imported, local) {
  return ImportSpecifierNode(imported, local);
}

export function createImportDefaultSpecifier(imported, local) {
  return ImportDefaultSpecifierNode(imported, local);
}

export function createImportNamespaceSpecifier(local) {
  return ImportNamespaceSpecifierNode(local);
}

export function createImport(encloseSpecifiers, specifiers, source) {
  return ImportNode(encloseSpecifiers, specifiers, source);
}

export function createParam(name, type, { isRest = false, isOptional = false } = {}) {
  return ParameterNode(name, type, isRest, isOptional);
}

export function createObjectParam(properties, type, isOptional) {
  return ObjectParameterNode(properties, type, isOptional);
}

export function createObjectParamProp(key, value, isOptional) {
  return ObjectParameterPropertyNode(key, value, isOptional);
}

export function createFunction(name, params, type, typeParameters) {
  return FunctionNode(name, params, type, typeParameters);
}

export function createInterface(name, members, baseInterfaces, typeParameters) {
  return InterfaceNode(name, members, baseInterfaces, typeParameters);
}

export function createInterfaceMethod(name, params, type, typeParameters, isStatic, isOptional) {
  return InterfaceMethodNode(name, params, type, typeParameters, isStatic, isOptional);
}

export function createInterfaceProperty(name, type, isStatic, isOptional) {
  return InterfacePropertyNode(name, type, isStatic, isOptional);
}

export function createInterfaceIndexer(name, keyType, returnType) {
  return InterfaceIndexerNode(name, keyType, returnType);
}

export function createInterfaceCall(params, type) {
  return InterfaceCallNode(params, type);
}

export function createClass(name, superName, members, typeParameters, superTypeParameters, impls) {
  return ClassNode(name, superName, members, typeParameters, superTypeParameters, impls);
}

export function createImplements(name, typeParameters) {
  return ImplementsNode(name, typeParameters);
}

export function createClassConstructor(params) {
  return ClassConstructorNode(params);
}

export function createClassMethod(name, params, type, typeParameters, isStatic) {
  return ClassMethodNode(name, params, type, typeParameters, isStatic);
}

export function createClassProperty(name, type, isStatic) {
  return ClassPropertyNode(name, type, isStatic);
}
