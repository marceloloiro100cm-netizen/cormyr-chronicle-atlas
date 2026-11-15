import type {KeyboardEvent} from 'react';

/** Four literal spaces survive storage and retain selection/caret positions. */
export const PARAGRAPH_INDENT='    ';

/**
 * Tab: inserts an indent at the cursor or before each selected line.
 * Shift+Tab is deliberately left to the browser's backwards focus navigation.
 */
export function indentTextSelection(text:string,start:number,end:number,indent=PARAGRAPH_INDENT):{
  text:string;selectionStart:number;selectionEnd:number;
}{
  const begin=Math.max(0,Math.min(text.length,start));
  const finish=Math.max(begin,Math.min(text.length,end));
  if(begin===finish){
    const cursor=begin+indent.length;
    return {
      text:text.slice(0,begin)+indent+text.slice(begin),
      selectionStart:cursor,selectionEnd:cursor,
    };
  }
  const lineStart=text.lastIndexOf('\n',begin-1)+1;
  const segment=text.slice(lineStart,finish);
  const indented=indent+segment.replace(/\n(?!$)/g,'\n'+indent);
  const lines=1+(segment.match(/\n(?!$)/g)?.length??0);
  return {
    text:text.slice(0,lineStart)+indented+text.slice(finish),
    selectionStart:begin+indent.length,
    selectionEnd:finish+lines*indent.length,
  };
}

/**
 * Does not intercept modifiers, composition or other keys. Since form fields
 * are controlled by React, selection is restored after the state update.
 */
export function handleTextareaTab(
  event:KeyboardEvent<HTMLTextAreaElement>,
  onChange:(next:string)=>void,
  indent=PARAGRAPH_INDENT,
):void{
  if(event.key!=='Tab'||event.shiftKey||event.ctrlKey||event.altKey||
    event.metaKey||event.nativeEvent.isComposing)return;
  const input=event.currentTarget;
  const result=indentTextSelection(input.value,input.selectionStart,input.selectionEnd,indent);
  if(input.hasAttribute('maxlength')&&input.maxLength>=0&&result.text.length>input.maxLength)return;
  event.preventDefault();
  event.stopPropagation();
  onChange(result.text);
  queueMicrotask(()=>{
    if(input.isConnected&&document.activeElement===input)
      input.setSelectionRange(result.selectionStart,result.selectionEnd);
  });
}
