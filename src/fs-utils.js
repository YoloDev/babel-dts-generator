import { dirname } from 'path';
import fs from 'fs';

export function ensureDir(p) {
  const dn = dirname(p);
  if (!fs.existsSync(dn)) {
    ensureDir(dn);
    try {
      fs.mkdirSync(dn);
    } catch (e) {} // eslint-disable-line no-empty
  }
}
