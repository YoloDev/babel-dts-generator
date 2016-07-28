export function safeString(str) {
  let result = '';
  for (let i = 0, l = str.length; i < l; i++) {
    const code = str.charCodeAt(i);
    if (isLineTerminator(code) || code === 0x5C /* \ */) {
      result += escapeDisallowedCharacter(code);
      continue;
    } else if (code < 0x20  /* SP */ || code > 0x7E  /* ~ */) {
      result += escapeAllowedCharacter(code, str.charCodeAt(i + 1));
      continue;
    }

    result += String.fromCharCode(code);
  }

  return result.replace('\'', '\\\'');
}

function isLineTerminator(ch) {
  return ch === 0x0A || ch === 0x0D || ch === 0x2028 || ch === 0x2029;
}

function isDecimalDigit(ch) {
  return ch >= 0x30 && ch <= 0x39;  // 0..9
}

function escapeDisallowedCharacter(code) {
  if (code === 0x5C  /* \ */) {
    return '\\\\';
  }

  if (code === 0x0A  /* \n */) {
    return '\\n';
  }

  if (code === 0x0D  /* \r */) {
    return '\\r';
  }

  if (code === 0x2028) {
    return '\\u2028';
  }

  if (code === 0x2029) {
    return '\\u2029';
  }

  throw new Error('Incorrectly classified character');
}

function escapeAllowedCharacter(code, next) {
  if (code === 0x08  /* \b */) {
    return '\\b';
  }

  if (code === 0x0C  /* \f */) {
    return '\\f';
  }

  if (code === 0x09  /* \t */) {
    return '\\t';
  }

  const hex = code.toString(16).toUpperCase();
  if (code > 0xFF) {
    const leading = '0000'.slice(hex.length);
    return `\\u${leading}${hex}`;
  } else if (code === 0x0000 && !isDecimalDigit(next)) {
    return '\\0';
  } else if (code === 0x000B  /* \v */) { // '\v'
    return '\\x0B';
  }

  const leading = '00'.slice(hex.length);
  return `\\x${leading}${hex}`;
}
