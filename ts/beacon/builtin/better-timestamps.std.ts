// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Better timestamps on messages: clock time instead of "5m", optional
 * seconds and 24-hour time, the date on older messages, and the full date
 * and time on hover.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import { beaconTweaks } from '../core/tweaks.std.ts';

export const ICON_BETTER_TIMESTAMPS = defineIcon([
  'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z',
  'M12 7v5l3 2',
]);

const DAY = 24 * 60 * 60 * 1000;

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default {
  id: 'better-timestamps',
  builtin: true,
  icon: ICON_BETTER_TIMESTAMPS,
  name: 'Better timestamps',
  version: '1.0.0',
  description:
    'Exact times on messages instead of “5m”, with dates on older ones and the full date on hover.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'mode',
      type: 'select',
      symbol: 'clock',
      label: 'Message times',
      options: [
        { value: 'absolute', label: 'Clock time (14:05)' },
        { value: 'signal', label: 'Signal’s style (Now, 5m, 14:05)' },
      ],
      defaultValue: 'absolute',
    },
    {
      key: 'hour12',
      type: 'select',
      symbol: 'clock-hour-3',
      label: 'Clock',
      options: [
        { value: 'system', label: 'Follow system' },
        { value: '24', label: '24-hour' },
        { value: '12', label: '12-hour' },
      ],
      defaultValue: 'system',
    },
    {
      key: 'seconds',
      type: 'toggle',
      symbol: 'timer',
      label: 'Show seconds',
      defaultValue: false,
    },
    {
      key: 'dates',
      type: 'toggle',
      symbol: 'calendar',
      label: 'Add the date to messages older than today',
      defaultValue: true,
    },
    {
      key: 'hover',
      type: 'toggle',
      symbol: 'info',
      label: 'Full date and time on hover',
      defaultValue: true,
    },
  ],

  start(ctx) {
    const hourCycle = (): Intl.DateTimeFormatOptions => {
      const choice = ctx.settings.get<string>('hour12');
      if (choice === '24') {
        return { hourCycle: 'h23' };
      }
      if (choice === '12') {
        return { hourCycle: 'h12' };
      }
      return {};
    };

    const sync = () => {
      const absolute = ctx.settings.get<string>('mode') === 'absolute';
      const seconds = ctx.settings.get<boolean>('seconds');
      const dates = ctx.settings.get<boolean>('dates');

      beaconTweaks.formatMessageTime = absolute
        ? (timestamp, now) => {
            const date = new Date(timestamp);
            const time = date.toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
              ...(seconds ? { second: '2-digit' } : {}),
              ...hourCycle(),
            });
            if (!dates || sameDay(date, new Date(now))) {
              return time;
            }
            const withinWeek = now - timestamp < 6 * DAY;
            const sameYear = date.getFullYear() === new Date(now).getFullYear();
            const day = date.toLocaleDateString(
              undefined,
              withinWeek
                ? { weekday: 'short' }
                : {
                    day: 'numeric',
                    month: 'short',
                    ...(sameYear ? {} : { year: 'numeric' }),
                  }
            );
            return `${day}, ${time}`;
          }
        : undefined;

      beaconTweaks.messageTimeTitle = ctx.settings.get<boolean>('hover')
        ? timestamp =>
            new Date(timestamp).toLocaleString(undefined, {
              dateStyle: 'full',
              timeStyle: 'medium',
              ...hourCycle(),
            })
        : undefined;
    };
    sync();
    ctx.settings.onChange(sync);
    ctx.onDispose(() => {
      beaconTweaks.formatMessageTime = undefined;
      beaconTweaks.messageTimeTitle = undefined;
    });
  },
} satisfies AddonManifest;
