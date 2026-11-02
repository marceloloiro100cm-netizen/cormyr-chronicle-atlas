import type {ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';

/** Single presentation contract for holdings across Exército, Terras,
 * Fortificações, Economia and future property catalogs. Domain/purchase logic
 * lives with the caller; this primitive owns only the consistent visual shell.
 */
export function HouseAssetCard({title,status,description,icon,inactive=false,children,testId}:{
 title:string;status:string;description:string;icon:ReactNode;
 inactive?:boolean;children:ReactNode;testId?:string;
}){
 return <details className={'military-asset-card house-asset-card'+(inactive?' military-asset-inactive':'')}
  data-testid={testId}>
  <summary className="military-asset-summary">
   <span className="military-asset-icon">{icon}</span>
   <span className="military-asset-details">
    <small>{title}</small>
    <strong>{status}</strong>
    <span className="military-asset-short">{description}</span>
   </span>
   <ChevronDown size={17} className="military-asset-chevron" aria-hidden/>
  </summary>
  <div className="military-asset-expanded">{children}</div>
 </details>;
}
export function HouseAssetGrid({children}:{children:ReactNode}){
 return <div className="military-assets-grid house-asset-grid">{children}</div>;
}
