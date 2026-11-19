import {useEffect, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {PlayersArea} from '@/components/players/players-workspace';
import {activateFirebaseWorkspace, deactivateFirebaseWorkspaceSoon} from '@/lib/firebase-workspace/activate';
import type {VisualPreviewProfile} from '@/lib/visual-preview/state';

/**
 * Área interna após o login Firebase ("Portões de Cormyr"): a mesma interface
 * original da segunda temporada (Conselho, Ficha, Espionagem, Hub Temporal,
 * Missivas, Galeria, Jornal e visão dos jogadores), sem o módulo de batalha.
 *
 * As telas consultam o acervo importado Firebase em modo de leitura.
 * A autorização é conferida no servidor a cada consulta, sem demonstrações.
 */
export default function FirebaseCampaignWorkspace({profile, memberHouseIds, onSignOut}: {
  profile: VisualPreviewProfile;
  memberHouseIds: readonly string[];
  onSignOut: () => void;
}) {
  const qc = useQueryClient();
  // Ativada durante a primeira renderização, antes de qualquer consulta dos filhos.
  useState(() => { activateFirebaseWorkspace(); return true; });
  const houseKey = memberHouseIds.join(',');
  useEffect(() => {
    activateFirebaseWorkspace();
    return () => {
      qc.clear();
      deactivateFirebaseWorkspaceSoon();
    };
  }, [profile, houseKey, qc]);
  return <PlayersArea onSignOut={onSignOut} hideBattle/>;
}
