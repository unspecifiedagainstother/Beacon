// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Safe link opening: before a web link leaves Beacon, show where it really
 * goes, flag lookalike/shortened/unencrypted links, and strip tracking
 * parameters. Covers links in messages (click guard, capture phase) and
 * everything that goes through openLinkInWebBrowser (link previews, help).
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_LINK_SAFETY } from '../addons/icons.std.ts';
import { createElement, createModal } from '../core/ui.dom.ts';
import {
  analyzeLink,
  isTrustedSite,
  LINK_WARNING_TEXT,
} from '../util/linkSafety.std.ts';
import {
  cleanUrl,
  DEFAULT_TRACKING_PARAMS,
  toParamMatchers,
} from '../util/clearUrls.std.ts';

const MATCHERS = toParamMatchers(DEFAULT_TRACKING_PARAMS);

function openDirect(url: string): void {
  // Main process turns this navigation into shell.openExternal().
  window.location.href = url;
}

export default {
  id: 'link-safety',
  builtin: true,
  category: 'privacy',
  icon: ICON_LINK_SAFETY,
  name: 'Links',
  version: '1.0.0',
  description:
    'See where a link really goes before your browser opens it, and drop tracking parameters.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'confirm',
      type: 'select',
      symbol: 'link',
      label: 'Confirm before opening links',
      options: [
        { value: 'always', label: 'Always' },
        { value: 'suspicious', label: 'Only suspicious links' },
        { value: 'never', label: 'Never' },
      ],
      defaultValue: 'always',
    },
    {
      key: 'stripTracking',
      type: 'toggle',
      symbol: 'filter',
      label: 'Remove tracking parameters when opening',
      description: 'utm_*, fbclid, gclid, si and similar.',
      defaultValue: true,
    },
    {
      key: 'trusted',
      type: 'text',
      symbol: 'check-circle',
      label: 'Trusted sites (no confirmation)',
      description: 'Comma-separated; subdomains included.',
      placeholder: 'signal.org, example.com',
      defaultValue: 'signal.org',
    },
  ],

  start(ctx) {
    const trustedList = () =>
      ctx.settings
        .get<string>('trusted')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const addTrusted = (site: string) => {
      const list = trustedList();
      if (!list.includes(site)) {
        ctx.settings.set('trusted', [...list, site].join(', '));
      }
    };

    /** Returns true when the link was handled (opened, shown or blocked). */
    const guard = (raw: string, text: string | undefined): boolean => {
      const analysis = analyzeLink(raw, text);
      if (!analysis || !/^https?:$/.test(analysis.url.protocol)) {
        return false;
      }
      const target = ctx.settings.get<boolean>('stripTracking')
        ? cleanUrl(raw, MATCHERS)
        : raw;
      const removedTracking = target !== raw;
      const mode = ctx.settings.get<string>('confirm');
      const trusted = isTrustedSite(analysis.url.hostname, trustedList());
      const suspicious = analysis.warnings.length > 0;
      let needsConfirm = false;
      if (mode === 'always') {
        needsConfirm = !trusted || suspicious;
      } else if (mode === 'suspicious') {
        needsConfirm = suspicious;
      }

      if (!needsConfirm) {
        if (removedTracking) {
          openDirect(target);
          return true;
        }
        return false;
      }

      const url = new URL(target);
      const hostLine = createElement({
        tag: 'div',
        className: 'BeaconLink__host',
        children: [
          createElement({ tag: 'span', text: `${url.protocol}//` }),
          createElement({
            tag: 'strong',
            className: analysis.warnings.length ? 'BeaconLink__site--warn' : '',
            text: analysis.host,
          }),
          ...(url.port
            ? [createElement({ tag: 'span', text: `:${url.port}` })]
            : []),
        ],
      });
      if (analysis.host !== analysis.url.hostname) {
        hostLine.appendChild(
          createElement({
            tag: 'div',
            className: 'BeaconLink__punycode',
            text: `(${analysis.url.hostname})`,
          })
        );
      }
      const full = createElement({
        tag: 'code',
        className: 'BeaconLink__full',
        text: target,
      });
      const warnings = createElement({
        tag: 'ul',
        className: 'BeaconLink__warnings',
        children: analysis.warnings.map(w =>
          createElement({ tag: 'li', text: LINK_WARNING_TEXT[w] })
        ),
      });
      const content = createElement({
        tag: 'div',
        className: 'BeaconLink',
        children: [
          hostLine,
          full,
          ...(analysis.warnings.length ? [warnings] : []),
          ...(removedTracking
            ? [
                createElement({
                  tag: 'p',
                  className: 'BeaconLink__note',
                  text: 'Tracking parameters were removed.',
                }),
              ]
            : []),
        ],
      });

      const modal = createModal({
        title: analysis.warnings.length ? 'Check this link' : 'Open link?',
        content,
        actions: [
          {
            label: 'Copy',
            onClick: async () => {
              await navigator.clipboard.writeText(target);
              ctx.ui.showNotification('Link copied');
              modal.close();
            },
          },
          ...(analysis.warnings.length === 0 && !trusted
            ? [
                {
                  label: `Always trust ${analysis.site}`,
                  onClick: () => {
                    addTrusted(analysis.site);
                    modal.close();
                    openDirect(target);
                  },
                },
              ]
            : []),
          {
            label: 'Open',
            variant: analysis.warnings.length ? 'destructive' : 'primary',
            onClick: () => {
              modal.close();
              openDirect(target);
            },
          },
        ],
      });
      return true;
    };

    ctx.filters.add('link.open', (url, info) => {
      if (!url) {
        return url;
      }
      return guard(url, info.text) ? null : url;
    });

    // Links in message bodies and anywhere else in the page.
    const onClick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || (ev.type === 'auxclick' && ev.button !== 1)) {
        return;
      }
      const anchor = (ev.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      if (anchor.closest('.BeaconModal')) {
        return;
      }
      const href = anchor.getAttribute('href') ?? '';
      if (!/^https?:/i.test(href)) {
        return;
      }
      if (guard(href, anchor.textContent ?? undefined)) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('auxclick', onClick, true);
    ctx.onDispose(() => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('auxclick', onClick, true);
    });
  },
} satisfies AddonManifest;
