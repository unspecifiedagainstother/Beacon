// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

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
