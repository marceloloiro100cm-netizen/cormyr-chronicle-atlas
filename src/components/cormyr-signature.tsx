import type {ReactNode} from 'react';

/**
 * Assinatura Horizontal Compacta oficial do Atlas de Cormyr:
 * brasão sem moldura + filete dourado com losango + CORMYR por inteiro.
 */
export function CormyrSignature({subtitle='Crônicas do Reino',compact=false,tone='light',children}:{
  subtitle?:string;
  compact?:boolean;
  tone?:'dark'|'light';
  children?:ReactNode;
}){
  const markSrc=tone==='dark'
    ?'/cormyr/brand/cormyr-brasao-escuro.svg'
    :'/cormyr/brand/cormyr-brasao.svg';
  return <span className={'cormyr-signature'+(compact?' cormyr-signature--compact':'')+(tone==='light'?' cormyr-signature--light':'')}>
    <img className="cormyr-signature__mark" src={markSrc}
      alt="" aria-hidden="true" width={74} height={84}/>
    <span className="cormyr-signature__divider" aria-hidden="true">
      <span className="cormyr-signature__gem">◆</span>
    </span>
    <span className="cormyr-signature__copy">
      <span className="cormyr-signature__kicker">ATLAS DE</span>
      <strong className="cormyr-signature__word">CORMYR</strong>
      {subtitle&&<small className="cormyr-signature__subtitle">{subtitle}</small>}
      {children&&<span className="cormyr-signature__extra">{children}</span>}
    </span>
  </span>;
}
