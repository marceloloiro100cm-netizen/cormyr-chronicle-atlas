import {useState} from 'react';
import {Shield} from 'lucide-react';
import {ImageViewer} from '@/components/image-viewer';
import {PrivateImage} from '@/components/campaign-content';
import {vassalCrestUrl} from '@/lib/house/vassal-links';
import {heraldicCrestUrl,type HeraldicHouse} from '@/lib/house/heraldry';

type Props={
 houseName:string;
 theme:HeraldicHouse|null;
 crest:string|null;
 privatePath:string|null|undefined;
};
/** Preserve the original zoom/download interaction, with non-broken-image fallbacks. */
export function HouseHeaderCrest({houseName,theme,crest,privatePath}:Props){
 const [failed,setFailed]=useState<string[]>([]);
 const [privateFailed,setPrivateFailed]=useState(false);
 const official=heraldicCrestUrl(theme);
 const original=vassalCrestUrl(crest);
 const caption='Brasão da Casa '+houseName;
 const showImage=(src:string)=><ImageViewer
  src={src} caption={caption}
  triggerClassName="house-crest-trigger"
  imageClassName="house-crest-image"
  onImageError={()=>setFailed(previous=>previous.includes(src)?previous:[...previous,src])}/>;
 // Use the complete crest uploaded to the House folder first. The thematic flag
 // is decorative, not a substitute for a registered full-resolution coat of arms.
 return <div className="house-official-crest">
  {privatePath&&!privateFailed?
    <PrivateImage path={privatePath} caption={caption} thumbnail zoomable onUnavailable={()=>setPrivateFailed(true)}/>:
   original&&!failed.includes(original)?showImage(original):
   official&&!failed.includes(official)?showImage(official):
    <Shield role="img" aria-label={'Brasão indisponível para '+houseName}/>}
 </div>;
}
