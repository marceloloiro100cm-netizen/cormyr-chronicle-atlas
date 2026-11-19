import {useEffect, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {PlayersArea} from '@/components/players/players-workspace';
import {activateVisualPreview, deactivateVisualPreviewSoon} from '@/lib/visual-preview/activate';
import type {VisualPreviewProfile} from '@/lib/visual-preview/state';

/**
 * Área interna após o login Firebase ("Portões de Cormyr"): a mesma interface
 * original da segunda temporada (Conselho, Ficha, Espionagem, Hub Temporal,
 * Missivas, Galeria, Jornal e visão dos jogadores), sem o módulo de batalha.
 *
 * Enquanto os conectores Firebase não forem ligados, as telas usam a prévia
 * visual (dados de demonstração locais). O perfil exibido vem da sessão
 * Firebase já validada pelo servidor; a prévia não concede permissão alguma.
 */
export default function FirebaseCampaignWorkspace({profile, memberHouseIds, onSignOut}: {
  profile: VisualPreviewProfile;
  memberHouseIds: readonly string[];
  onSignOut: () => void;
}) {
  const qc = useQueryClient();
  // Ativada durante a primeira renderização, antes de qualquer consulta dos filhos.
  useState(() => { activateVisualPreview(profile, memberHouseIds); return true; });
  const houseKey = memberHouseIds.join(',');
  useEffect(() => {
    activateVisualPreview(profile, houseKey ? houseKey.split(',') : []);
    return () => {
      qc.clear();
      deactivateVisualPreviewSoon();
    };
  }, [profile, houseKey, qc]);
  return <PlayersArea onSignOut={onSignOut} hideBattle/>;
}
