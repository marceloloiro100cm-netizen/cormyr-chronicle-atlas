import {describe,it,expect} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {HousePlaylistButton,findHouseTrack} from '@/components/players/house-playlist-button';

describe('música exclusiva de cada Casa',()=>{
 it('resolve apenas faixas oficiais vinculadas ao catálogo, sem usar música regional',()=>{
  expect(findHouseTrack('Casa Goldfin')?.youtubeId).toBe('M5bnGEYw3SY');
  expect(findHouseTrack('Von der Harten')?.youtubeId).toBe('bR66gczzEdk');
  expect(findHouseTrack('Erdenor')?.youtubeId).toBe('n7GFlxcM3m8');
  expect(findHouseTrack('Evenhand')).toBeNull();
 });
 it('não carrega o YouTube antes de clique e repete somente a faixa da Casa',()=>{
  const view=render(<HousePlaylistButton houseName="Goldfin"/>);
  expect(view.container.querySelector('iframe')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/Reproduzir música da Casa Goldfin/}));
  const frame=view.container.querySelector('iframe');
  expect(frame).not.toBeNull();
  const url=new URL(frame!.src);
  expect(url.pathname).toBe('/embed/M5bnGEYw3SY');
  expect(url.searchParams.get('autoplay')).toBe('1');
  expect(url.searchParams.get('loop')).toBe('1');
  expect(url.searchParams.get('playlist')).toBe('M5bnGEYw3SY');
  fireEvent.click(screen.getByRole('button',{name:'Parar e fechar a música'}));
  expect(view.container.querySelector('iframe')).toBeNull();
  view.unmount();
 });
 it('mostra controle discreto mas não inventa música para Casas sem tema',()=>{
  const view=render(<HousePlaylistButton houseName="Evenhand"/>);
  expect(screen.getByRole('button',{name:/ainda não possui música própria/})).toBeDisabled();
  expect(view.container.querySelector('iframe')).toBeNull();
  view.unmount();
 });
});
