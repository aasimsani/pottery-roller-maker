import { describe, expect, test } from 'vitest';
import iconifyFixture from './__fixtures__/iconify-search.json';
import commonsFixture from './__fixtures__/commons-search.json';
import smithsonianFixture from './__fixtures__/smithsonian-search.json';
import iconifySets from './__fixtures__/iconify-sets.json';
import { iconSvg, iconSvgThumb, parseIconify } from './iconify';
import { parseCommons } from './commons';
import { parseSmithsonian, siImageUrl } from './smithsonian';
import { patternMonsterSvg, searchPatternMonster } from './patternMonster';
import { heroPatternSvg, searchHeroPatterns } from './heroPatterns';
import { BUILTIN_NAMES } from './builtin';

describe('Iconify', () => {
  const opts = { solidOnly: false, start: 0, pageSize: 64 };

  test('builds black SVG designs locally from the batch icon data, with the icon set licence', () => {
    const { items } = parseIconify(iconifyFixture, iconifySets, opts);
    const fern = items.find((d) => d.id === 'game-icons:fern')!;
    expect(fern.source).toBe('iconify');
    expect(fern.thumb.startsWith('data:image/svg+xml,')).toBe(true);
    expect(fern.data).toMatch(/^<svg[^>]+viewBox="0 0 512 512"[^>]+color="#000"/);
    expect(fern.data).toContain('currentColor');
    expect(fern.credit.license).toMatch(/CC BY/);
  });

  test('solid-only drops icons from sets that draw with strokes', () => {
    const all = parseIconify(iconifyFixture, iconifySets, opts).items;
    const solid = parseIconify(iconifyFixture, iconifySets, { ...opts, solidOnly: true }).items;
    expect(solid.length).toBeLessThan(all.length);
    expect(solid.some((d) => d.id.startsWith('iconoven:'))).toBe(false);
  });

  test('icons missing from the batch data are skipped', () => {
    const { items } = parseIconify(iconifyFixture, { 'game-icons': iconifySets['game-icons'] }, opts);
    expect(items.map((d) => d.id)).toEqual(['game-icons:fern']);
  });

  test('aliases resolve to their parent icon', () => {
    const set = { prefix: 'x', width: 24, height: 24, icons: { leaf: { body: '<path d="M0 0"/>' } }, aliases: { sprout: { parent: 'leaf' } } };
    expect(iconSvg(set, 'sprout', 240)).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 24 24" color="#000"><path d="M0 0"/></svg>');
    expect(iconSvg(set, 'missing')).toBeNull();
  });
});

describe('Wikimedia Commons', () => {
  test('maps file pages in search-rank order with licence and author', () => {
    const { items, next } = parseCommons(commonsFixture);
    expect(items).toHaveLength(3);
    expect(items[0].source).toBe('commons');
    expect(items[0].id.startsWith('File:')).toBe(true);
    expect(items[0].thumb).toMatch(/^https:\/\/upload\.wikimedia\.org|^https:\/\/thumb\.wikimedia\.org/);
    expect(items.every((d) => d.credit.license.length > 0)).toBe(true);
    expect(items[0].credit.author ?? '').not.toMatch(/</);
    expect(next).toBe('3');
  });
});

describe('Smithsonian Open Access', () => {
  test('keeps only records with a CC0 image', () => {
    const { items } = parseSmithsonian(smithsonianFixture, 0, 2);
    expect(items).toHaveLength(1);
    expect(items[0].credit.license).toBe('CC0');
    expect(items[0].thumb).toMatch(/ids\.si\.edu.*max=240$/);
    expect(items[0].data).toMatch(/ids\.si\.edu/);
  });
});

test('Smithsonian image sizes append to URLs with or without a query string', () => {
  expect(siImageUrl('https://ids.si.edu/ids/deliveryService/id/ark:/65665/abc', 240)).toBe('https://ids.si.edu/ids/deliveryService/id/ark:/65665/abc?max=240');
  expect(siImageUrl('https://ids.si.edu/ids/deliveryService?id=CHSDM-1', 240)).toBe('https://ids.si.edu/ids/deliveryService?id=CHSDM-1&max=240');
});

describe('pattern libraries', () => {
  test('Pattern Monster search matches titles and tags and yields tileable SVG', () => {
    const { items } = searchPatternMonster('waves');
    expect(items.length).toBeGreaterThan(3);
    expect(items.every((d) => d.texture)).toBe(true);
    const svg = patternMonsterSvg(items[0].data!);
    expect(svg).toMatch(/^<svg[^>]+width="\d+(\.\d+)?" height="\d+(\.\d+)?"/);
  });

  test('every Pattern Monster pattern renders to an SVG', () => {
    const { items } = searchPatternMonster('');
    expect(items.length).toBeGreaterThan(300);
    for (const d of items) expect(patternMonsterSvg(d.data!)).toContain('<path');
  });

  test('Hero Patterns lists all 87 patterns with credit', () => {
    const { items } = searchHeroPatterns('');
    expect(items).toHaveLength(87);
    expect(items[0].credit.license).toBe('CC BY 4.0');
    expect(heroPatternSvg(items[0].data!)).toMatch(/^<svg/);
  });

  test('built-in motifs are all listed', () => {
    expect(BUILTIN_NAMES).toContain('Leafy sprig');
  });
});

test('icon thumbnails rescale the stored SVG and keep its aspect ratio', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="1024" viewBox="0 0 12 24" color="#000"><path/></svg>';
  expect(iconSvgThumb(svg)).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="96" viewBox="0 0 12 24" color="#000"><path/></svg>');
});
