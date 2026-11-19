import type {ReactNode} from 'react';
import {CampaignShell} from '@/components/campaign-shell';

/**
 * Tela única de abertura do Conselho, usada do login até o acervo carregar.
 * Antes da área interna ativar o workspace Firebase, usa o relógio público.
 */
export function CouncilOpening({publicTime=false,children}:{publicTime?:boolean;children?:ReactNode}){
  return <CampaignShell publicTime={publicTime}>
    <h1>Conselho dos jogadores</h1>
    {children??<p role="status">Abrindo o Conselho…</p>}
  </CampaignShell>;
}
