// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from 'react';

import type { AddonInfo, AddonSettingValue } from '../beacon/core/types.dom.ts';

function getBeacon() {
  return window.Beacon;
}

export function useAddons(): Array<AddonInfo> {
  const [addons, setAddons] = useState<Array<AddonInfo>>(
    () => getBeacon()?.loader.list() ?? []
  );
  useEffect(() => {
    const beacon = getBeacon();
    if (!beacon) {
      return undefined;
    }
    const refresh = () => setAddons(beacon.loader.list());
    refresh();
    return beacon.loader.subscribe(refresh);
  }, []);
  return addons;
}

export function useAddonSettings(
  addonId: string
): Record<string, AddonSettingValue> {
  const [values, setValues] = useState(
    () => getBeacon()?.settings.getAll(addonId) ?? {}
  );
  useEffect(() => {
    const beacon = getBeacon();
    if (!beacon) {
      return undefined;
    }
    return beacon.settings.subscribe(changedId => {
      if (changedId === addonId) {
        setValues(beacon.settings.getAll(addonId));
      }
    });
  }, [addonId]);
  return values;
}

export function setAddonSetting(
  addonId: string,
  key: string,
  value: AddonSettingValue
): void {
  getBeacon()?.settings.set(addonId, key, value);
}
