// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useMemo, useState } from 'react';

import type { LocalizerType } from '../types/Util.std.ts';
import type { AxoSymbol } from '../axo/AxoSymbol.dom.tsx';
import { AxoList } from '../axo/items/AxoList.dom.tsx';
import { AxoItem } from '../axo/items/AxoItem.dom.tsx';
import { AxoSwitchItem } from '../axo/items/AxoSwitchItem.dom.tsx';
import { AxoClickableItem } from '../axo/items/AxoClickableItem.dom.tsx';
import { BEACON_FEATURES } from '../beacon/features.std.ts';
import type {
  BeaconFeatureKey,
  BeaconSettingsType,
} from '../beacon/features.std.ts';
import {
  BeaconCSSEditorDialog,
  countCssRules,
  getCustomCSS,
} from './BeaconCSSEditor.dom.tsx';
import { BeaconBuiltinFeatures } from './BeaconModules.dom.tsx';

export type PropsType = {
  i18n: LocalizerType;
  beaconSettings: BeaconSettingsType;
  onBeaconSettingChange: (key: BeaconFeatureKey, value: boolean) => void;
  hasCustomTitlebar: boolean;
  onCustomTitlebarChange: (value: boolean) => void;
  beaconNeedsRestart: boolean;
  onOpenModules: () => void;
  onOpenAppearance: () => void;
};

// Registry entries are booleans keyed by storage key; give each a glyph.
const FEATURE_SYMBOLS: Partial<Record<BeaconFeatureKey, AxoSymbol.Name>> = {
  beaconBlurPII: 'blur',
};

function Section({
  label,
  footer,
  children,
}: {
  label: string;
  footer?: string;
  children: JSX.Element | Array<JSX.Element>;
}): JSX.Element {
  return (
    <AxoList.Root>
      <AxoList.Header>
        <AxoList.Label>{label}</AxoList.Label>
      </AxoList.Header>
      <AxoList.Body>
        <AxoItem.Group>{children}</AxoItem.Group>
      </AxoList.Body>
      {footer ? (
        <AxoList.Footer>
          <AxoList.FooterDescription>{footer}</AxoList.FooterDescription>
        </AxoList.Footer>
      ) : null}
    </AxoList.Root>
  );
}

export function BeaconSettingsPage({
  i18n,
  beaconSettings,
  onBeaconSettingChange,
  hasCustomTitlebar,
  onCustomTitlebarChange,
  beaconNeedsRestart,
  onOpenModules,
  onOpenAppearance,
}: PropsType): JSX.Element {
  const [editorOpen, setEditorOpen] = useState(false);
  // Bumped when the editor closes so the summary re-reads the saved CSS.
  const [cssVersion, setCssVersion] = useState(0);
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const customCss = useMemo(() => getCustomCSS(), [cssVersion]);
  const ruleCount = customCss ? (countCssRules(customCss) ?? 0) : 0;
  const addonSummary = useMemo(() => {
    const list = (window.Beacon?.loader.list() ?? []).filter(a => !a.builtin);
    return {
      enabled: list.filter(a => a.enabled).length,
      total: list.length,
    };
  }, []);

  return (
    <AxoList.Group>
      {beaconNeedsRestart && (
        <div className="Beacon__restart-banner" role="status">
          {i18n('icu:Beacon__requires-restart')}
        </div>
      )}

      <Section label={i18n('icu:Beacon__settings-privacy')}>
        {BEACON_FEATURES.map(feature => (
          <AxoSwitchItem.Root
            key={feature.key}
            symbol={FEATURE_SYMBOLS[feature.key]}
            label={i18n(feature.labelKey as 'icu:Preferences__blur-pii')}
            description={i18n(
              feature.descriptionKey as 'icu:Preferences__blur-pii--description'
            )}
            checked={beaconSettings[feature.key]}
            onCheckedChange={value => onBeaconSettingChange(feature.key, value)}
          />
        ))}
      </Section>

      <AxoList.Root>
        <AxoList.Header>
          <AxoList.Label>{i18n('icu:Beacon__settings-builtin')}</AxoList.Label>
        </AxoList.Header>
        <BeaconBuiltinFeatures i18n={i18n} />
      </AxoList.Root>

      <Section
        label={i18n('icu:Beacon__settings-window')}
        footer={i18n('icu:Beacon__settings-window-footer')}
      >
        <AxoSwitchItem.Root
          symbol="device-laptop"
          label={i18n('icu:Preferences__custom-titlebar')}
          description={i18n('icu:Preferences__custom-titlebar--description')}
          checked={hasCustomTitlebar}
          onCheckedChange={onCustomTitlebarChange}
        />
      </Section>

      <Section
        label={i18n('icu:Beacon__settings-customize')}
        footer={i18n('icu:Beacon__settings-accent-footer')}
      >
        <AxoClickableItem.Root
          symbol="palette"
          label={i18n('icu:Beacon__css-editor-title')}
          description={
            ruleCount > 0
              ? i18n('icu:Beacon__css-editor-rules', { count: ruleCount })
              : i18n('icu:Beacon__css-editor-empty')
          }
          arrow="next"
          onClick={() => setEditorOpen(true)}
        />
        <AxoClickableItem.Root
          symbol="grid"
          label={i18n('icu:Beacon__modules-title')}
          description={i18n('icu:Beacon__modules-count', addonSummary)}
          arrow="next"
          onClick={onOpenModules}
        />
        <AxoClickableItem.Root
          symbol="tune"
          label={i18n('icu:Beacon__settings-accent')}
          description={i18n('icu:Beacon__settings-accent-description')}
          arrow="next"
          onClick={onOpenAppearance}
        />
      </Section>

      {editorOpen && (
        <BeaconCSSEditorDialog
          i18n={i18n}
          onClose={() => {
            setEditorOpen(false);
            setCssVersion(v => v + 1);
          }}
        />
      )}
    </AxoList.Group>
  );
}
