import {describe,it,expect,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {useState} from 'react';
import {handleTextareaTab,indentTextSelection,PARAGRAPH_INDENT} from './textarea-indent';

describe('indentação compartilhada para Jornal, Missivas e documentos',()=>{
 it('insere recuo no cursor sem apagar texto adjacente',()=>{
   expect(PARAGRAPH_INDENT).toBe('    ');
   expect(indentTextSelection('Carta para Suzail',6,6)).toEqual({
     text:'Carta     para Suzail',selectionStart:10,selectionEnd:10,
   });
 });
 it('recua todas as linhas selecionadas, preservando linhas sem seleção',()=>{
   expect(indentTextSelection('Intro\nPrimeira\nSegunda\nFim',6,22)).toEqual({
     text:'Intro\n    Primeira\n    Segunda\nFim',
     selectionStart:10,selectionEnd:30,
   });
 });
 it('não insere recuo extra na linha que começa após a seleção',()=>{
   expect(indentTextSelection('A\nB\nC',2,4)).toEqual({
     text:'A\n    B\nC',selectionStart:6,selectionEnd:8,
   });
 });
 it('limita posições de cursor fora do intervalo',()=>{
   expect(indentTextSelection('A',100,100)).toEqual({
     text:'A    ',selectionStart:5,selectionEnd:5,
   });
 });
 it('intercepta só Tab simples; mantém Shift+Tab para navegação assistiva',()=>{
   function Textarea(){
     const [text,setText]=useState('Registros');
     return <textarea aria-label="Texto" value={text}
       onChange={e=>setText(e.target.value)}
       onKeyDown={e=>handleTextareaTab(e,setText)}/>;
   }
   render(<Textarea/>);
   const field=screen.getByRole('textbox',{name:'Texto'}) as HTMLTextAreaElement;
   field.focus();
   field.setSelectionRange(0,0);
   expect(fireEvent.keyDown(field,{key:'Tab',shiftKey:true,cancelable:true})).toBe(true);
   expect(field.value).toBe('Registros');
   expect(fireEvent.keyDown(field,{key:'Tab',cancelable:true})).toBe(false);
   expect(field.value).toBe('    Registros');
   expect(fireEvent.keyDown(field,{key:'Enter',cancelable:true})).toBe(true);
 });
 it('não intercepta a tecla durante composição IME ou Ctrl/Meta',()=>{
   const changed=vi.fn();
   const fake=(overrides:Record<string,unknown>)=>({
     key:'Tab',shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,
     nativeEvent:{isComposing:false},preventDefault:vi.fn(),
     stopPropagation:vi.fn(),currentTarget:{},...overrides,
   });
   for(const options of [
     {shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},
     {nativeEvent:{isComposing:true}},{key:'Escape'},
   ]){
     const event=fake(options);
     handleTextareaTab(event as never,changed);
     expect(event.preventDefault).not.toHaveBeenCalled();
   }
   expect(changed).not.toHaveBeenCalled();
 });
});
