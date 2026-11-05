/** Simulador apartado. Nenhum tipo aqui referencia HouseState mutável. */
export type Side = 'attacker' | 'defender';
export type Phase = 'setup' | 'ready' | 'active' | 'completed' | 'archived';
export type Morale = 'steady' | 'shaken' | 'routed';
export type Control = 'human' | 'ai';
export type Terrain = 'plain' | 'forest' | 'hill' | 'rock';
export type Training = 'green' | 'trained' | 'veteran' | 'elite';
export type Hex = Readonly<{ q: number; r: number }>;
export type MapTile = Readonly<Hex & { terrain: Terrain }>;
export type BattleMap = Readonly<{
  id: string; schemaVersion: 2; width: 11 | 15; height: 9 | 11;
  tiles: readonly MapTile[];
  deployment: Readonly<Record<Side, readonly Hex[]>>;
  label: string;
}>;
export type SourceReference = Readonly<{
  kind: 'fictional' | 'house-readonly';
  houseId?: string; unitId?: string; sourceVersion?: number;
  sourceCapturedAt?: string; officialHealth?: number; officialMaxHealth?: number;
  warnings?: readonly string[];
}>;
export type BattleStack = Readonly<{
  id: string; side: Side; name: string; primaryTypeId: string;
  originalTypeIds: readonly string[]; training: Training;
  source: SourceReference; initialCount: number; currentHp: number;
  hpPerSoldier: number; damagePerSoldier: number;
  attack: number; defense: number; armor: number;
  movementHex: number; rangeHex: number; moraleTypeModifier: number;
  moraleState: Morale; position: Hex;
  movedThisActivation: boolean; attackedThisActivation: boolean;
  waitedThisRound: boolean; defenseGuard: boolean;
  retaliationUsedRound: number | null;
  profileDecisionReason?: string; appliedEffectIds: readonly string[];
}>;
export type BattleCommand =
  | { type: 'MOVE'; unitId: string; to: Hex }
  | { type: 'ATTACK'; unitId: string; targetId: string }
  | { type: 'DEFEND'; unitId: string }
  | { type: 'WAIT'; unitId: string }
  | { type: 'END_ACTIVATION'; unitId: string }
  | { type: 'MANUAL_FINISH'; reason: string; winnerSide: Side | null };
/** Lote 3: evento local; hashes/replay entrarão no lote 8. */
export type BattleEvent = Readonly<{
  seq: number; round: number; actorId: string; type: string;
  command: BattleCommand; delta: Readonly<Record<string, unknown>>;
}>;
export type BattleState = Readonly<{
  id: string; name: string; phase: Phase; schemaVersion: 2; rulesVersion: 'PTE-2.0';
  seed: string; rngAlgorithm: 'none-PTE-2.0';
  map: BattleMap; controls: Readonly<Record<Side, Control>>;
  stacks: readonly BattleStack[]; round: number;
  activationQueue: readonly string[]; waitingQueue: readonly string[];
  activeUnitId: string | null; noProgressRounds: number;
  events: readonly BattleEvent[]; winner: Side | null; resultReason?: string;
}>;
