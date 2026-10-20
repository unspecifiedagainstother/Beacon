// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The one hook bus instance.
 *
 * Lives in its own tiny module so upstream code (edit/delete handlers) can
 * emit hooks without importing the runtime, which pulls in the loader and
 * every addon.
 */

import { HookBus } from './hook-bus.std.ts';

export const beaconHookBus = new HookBus();
