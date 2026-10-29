import { describe, it, expect } from 'vitest';
import { cleanGalleryTitle } from '../lib/gallery';

describe('cleanGalleryTitle', () => {
  it('removes common image extensions from titles', () => {
    expect(cleanGalleryTitle('Retrato da Lady.png')).toBe('Retrato da Lady');
    expect(cleanGalleryTitle('Lorde Kael Ashkar.png')).toBe('Lorde Kael Ashkar');
    expect(cleanGalleryTitle('Castelo Cinzaria.PNG')).toBe('Castelo Cinzaria');
    expect(cleanGalleryTitle('imagem.jpg')).toBe('imagem');
    expect(cleanGalleryTitle('imagem.jpeg')).toBe('imagem');
    expect(cleanGalleryTitle('imagem.webp')).toBe('imagem');
    expect(cleanGalleryTitle('imagem.gif')).toBe('imagem');
    expect(cleanGalleryTitle('imagem.avif')).toBe('imagem');
    expect(cleanGalleryTitle('imagem.svg')).toBe('imagem');
  });

  it('handles titles without extensions', () => {
    expect(cleanGalleryTitle('Retrato da Lady')).toBe('Retrato da Lady');
  });

  it('handles null, undefined, and empty string', () => {
    expect(cleanGalleryTitle(null)).toBe('');
    expect(cleanGalleryTitle(undefined)).toBe('');
    expect(cleanGalleryTitle('')).toBe('');
  });

  it('trims whitespace', () => {
    expect(cleanGalleryTitle('  Retrato .png  ')).toBe('Retrato');
  });
});
