import { describe, expect, it } from 'vitest';
import { normalizeSettings, starterSettings } from '../src/data/starter';
import { nextId } from '../src/store/selectors';
import type { Profile, Settings } from '../src/types/board';

/**
 * Settings are NOT schema-validated — unlike the board, they are read straight
 * from a file or a Firestore document that may predate a field. Every read site
 * therefore depends on normalizeSettings having filled the gaps, and the failure
 * mode is a crash on `undefined.deleteStory` rather than a rejected write.
 */

const profile: Profile = {
  name: 'Ada',
  email: 'ada@example.com',
  initials: 'AD',
  avatarColor: '#6ee7b7',
};

describe('normalizeSettings', () => {
  it('returns full defaults for a completely absent object', () => {
    expect(normalizeSettings(null, profile)).toEqual(starterSettings(profile));
    expect(normalizeSettings(undefined, profile)).toEqual(starterSettings(profile));
  });

  it('returns defaults rather than throwing for a non-object', () => {
    expect(normalizeSettings('nope', profile)).toEqual(starterSettings(profile));
    expect(normalizeSettings(42, profile)).toEqual(starterSettings(profile));
  });

  it('fills in confirmations for settings saved before the field existed', () => {
    const legacy = { ...starterSettings(profile) } as Partial<Settings>;
    delete legacy.confirmations;

    const result = normalizeSettings(legacy, profile);
    // Defaults to asking — the safe direction for a destructive action.
    expect(result.confirmations).toEqual({ deleteStory: true, deleteTask: true });
  });

  it('defaults a partially present confirmations block per key', () => {
    const result = normalizeSettings(
      { confirmations: { deleteTask: false } },
      profile,
    );
    expect(result.confirmations.deleteTask).toBe(false);
    expect(result.confirmations.deleteStory).toBe(true);
  });

  it('preserves stored values over defaults', () => {
    const result = normalizeSettings(
      {
        appearance: { theme: 'light', accent: '#123456', radiusScale: 'sharp' },
        confirmations: { deleteStory: false, deleteTask: false },
        shortcuts: { enabled: false },
      },
      profile,
    );
    expect(result.appearance.theme).toBe('light');
    expect(result.shortcuts.enabled).toBe(false);
    expect(result.confirmations).toEqual({ deleteStory: false, deleteTask: false });
  });

  it('keeps a stored profile rather than overwriting it with the session one', () => {
    const stored = { profile: { ...profile, name: 'Renamed in Settings' } };
    expect(normalizeSettings(stored, profile).profile.name).toBe('Renamed in Settings');
  });

  it('fills a partial group without dropping its siblings', () => {
    // A hand-edited file that set one density but not the others.
    const result = normalizeSettings({ board: { showStats: false } }, profile);
    expect(result.board.showStats).toBe(false);
    expect(result.board.density.new).toBe('normal');
    expect(result.board.autoExpandActive).toBe(true);
  });
});

describe('nextId against a growing list', () => {
  /**
   * duplicateStory mints one id per copied task off an accumulator rather than
   * off the original list. Without that, every copied task would be handed the
   * same id and the write would be rejected for duplicate ids.
   */
  it('yields distinct ids when each new item is appended before the next call', () => {
    const list = [{ id: 'T-1' }, { id: 'T-2' }];
    const minted: string[] = [];

    for (let i = 0; i < 4; i += 1) {
      const id = nextId('T-', list);
      minted.push(id);
      list.push({ id });
    }

    expect(minted).toEqual(['T-3', 'T-4', 'T-5', 'T-6']);
    expect(new Set(minted).size).toBe(4);
  });

  it('repeats itself when the list is not grown — the bug the accumulator avoids', () => {
    const list = [{ id: 'T-1' }];
    expect(nextId('T-', list)).toBe(nextId('T-', list));
  });
});
