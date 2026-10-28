import {describe,it,expect,vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {contentParts,imageToken,validateImage,namedCharacters} from '@/lib/campaign-content';
import {ImagePicker} from '@/components/campaign-content';
import {filterLetters,type LetterRow} from '@/lib/letters';
import {docsText} from '@/lib/drive-library.server';
const letters=[{id:'a',letter_number:1,letter_kind:'geral'},{id:'b',letter_number:2,letter_kind:'reservada'},{id:'c',letter_number:1,letter_kind:'reservada'}].map(l=>({...l,sender_user_id:'sender'})) as LetterRow[];
describe('Missivas e imagens',()=>{
  it('filtra pelo número da missiva',()=>expect(filterLetters(letters,[],{number:'1',kind:'',answered:''}).map(l=>l.id)).toEqual(['a','c']));
  it('filtra gerais e reservadas',()=>expect(filterLetters(letters,[],{number:'',kind:'geral',answered:''}).map(l=>l.id)).toEqual(['a']));
  it('filtra respondidas',()=>expect(filterLetters(letters,[{letter_id:'b',author_user_id:'recipient',publication_state:'delivered'}],{number:'',kind:'',answered:'yes'}).map(l=>l.id)).toEqual(['b']));
  it('filtra não respondidas',()=>expect(filterLetters(letters,[{letter_id:'b',author_user_id:'recipient',publication_state:'delivered'}],{number:'',kind:'',answered:'no'}).map(l=>l.id)).toEqual(['a','c']));
  it('preserva texto e referência privada da imagem',()=>expect(contentParts('Carta\n'+imageToken('user/id/0.jpg','Castelo'))).toEqual([{text:'Carta\n'},{path:'user/id/0.jpg',caption:'Castelo'}]));
  it('recusa arquivos executáveis ou SVG',()=>expect(()=>validateImage({type:'image/svg+xml',size:100})).toThrow());
  it('recusa imagem acima de 5 MB',()=>expect(()=>validateImage({type:'image/png',size:5242881})).toThrow());
  it('lista somente nomes explicitamente identificados na fonte',()=>expect(namedCharacters(['Nome: Kael Ashkar.\nCastelo: Cinzaria\nNome: Kael Ashkar.'])).toEqual(['Kael Ashkar']));
  it('lê texto em tabelas e abas sem inventar personagens',()=>{const doc={tabs:[{documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:'Kael Ashkar\n'}}]}}]}}}]};expect(docsText(doc)).toBe('Kael Ashkar\n');});
});

describe('ImagePicker', () => {
  it('displays an error when an invalid image is selected', () => {
    const onChange = vi.fn();
    render(<ImagePicker images={[]} onChange={onChange} />);

    const input = screen.getByLabelText('Adicionar imagens');
    const file = new File([''], 'test.svg', { type: 'image/svg+xml' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByRole('alert')).toHaveTextContent('Use uma imagem JPG, PNG, WebP ou GIF.');
    expect(onChange).not.toHaveBeenCalled();
  });
});