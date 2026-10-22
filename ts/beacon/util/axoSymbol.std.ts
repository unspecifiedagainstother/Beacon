// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Addon-supplied icon names are plain strings; Axo throws on unknown names,
 * which would crash the whole message/menu/settings row. Anything not in
 * the symbol set becomes "no icon".
 */

import type { AxoSymbol } from '../../axo/AxoSymbol.dom.tsx';
import { _getAllAxoSymbolNames } from '../../axo/_internal/AxoSymbolDefs.generated.std.ts';

let known: ReadonlySet<string> | undefined;

export function toAxoSymbol(
  name: string | undefined
): AxoSymbol.Name | undefined {
  if (!name) {
    return undefined;
  }
  known ??= new Set(_getAllAxoSymbolNames());
  return known.has(name) ? (name as AxoSymbol.Name) : undefined;
}
