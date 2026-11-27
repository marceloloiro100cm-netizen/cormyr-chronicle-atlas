import type {ReactNode} from 'react';

/** O C coroado do dragão substitui a inicial de Cormyr nas assinaturas. */
export function CormyrSignature({subtitle='Crônicas do Reino',compact=false,children}:{
  subtitle?:string;
  compact?:boolean;
  children?:ReactNode;
}){
  return <span className={'cormyr-signature'+(compact?' cormyr-signature--compact':'')}>
    <img className="cormyr-signature__mark" src="/cormyr/brand/cormyr-brasao-escuro.svg"
      alt="" aria-hidden="true" width={67} height={74}/>
    <span className="cormyr-signature__copy">
      <span className="cormyr-signature__kicker">ATLAS DE</span>
      <strong className="cormyr-signature__word">ORMYR</strong>
      {subtitle&&<small className="cormyr-signature__subtitle">{subtitle}</small>}
      {children&&<span className="cormyr-signature__extra">{children}</span>}
    </span>
  </span>;
}
