import { RESOURCE_KEYS, type Resources } from "./types";
export const REGIONS: Record<string, { name: string; values: number[]; aliases: string[] }> = {
  crownlands: { name: "Crownlands", values: [10, 10, 5, 20, 5, 10, 10], aliases: [] },
  veilstone: { name: "Veilstone", values: [20, 0, 10, 5, 5, 15, 15], aliases: [] },
  shieldmark: { name: "Shieldmark", values: [10, 5, 10, 10, 5, 20, 10], aliases: [] },
  helmlands: { name: "Helmlands", values: [5, 10, 15, 10, 20, 5, 5], aliases: [] },
  horselands: { name: "Horselands", values: [0, 10, 20, 5, 10, 10, 15], aliases: [] },
  dragoncoast: {
    name: "Dragon Coast",
    values: [5, 10, 15, 0, 10, 10, 20],
    aliases: ["dragon coast"],
  },
  swordmark: { name: "Swordmarch", values: [10, 20, 0, 10, 5, 10, 15], aliases: ["swordmarch"] },
  ferlin: { name: "Ferlin", values: [10, 10, 10, 10, 10, 10, 10], aliases: [] },
  stonelands: { name: "Stonelands", values: [10, 5, 15, 0, 10, 15, 15], aliases: [] },
  elfhold: { name: "Elfhold", values: [10, 10, 5, 15, 0, 15, 15], aliases: [] },
  volkumburgh: { name: "Volkumburgh", values: [10, 10, 10, 5, 10, 15, 10], aliases: [] },
};
export function regionId(name: string) {
  const normalized = name.toLowerCase().trim();
  return (
    Object.entries(REGIONS).find(
      ([id, r]) =>
        id === normalized || r.name.toLowerCase() === normalized || r.aliases.includes(normalized),
    )?.[0] ?? ""
  );
}
export function regionBonus(name: string): Resources {
  const values = REGIONS[regionId(name)]?.values ?? [];
  return Object.fromEntries(RESOURCE_KEYS.map((key, i) => [key, values[i] ?? 0])) as Resources;
}
export const FOUNDATIONS = [
  { roll: 1, name: "Antiga", year: 26, era: "Fundação de Cormyr", events: "1d6+3" },
  { roll: 2, name: "Muito antiga", year: 400, era: "Shoon War", events: "1d6+2" },
  { roll: 3, name: "Velha", year: 1018, era: "First Dracorage War", events: "1d6+1" },
  { roll: 4, name: "Estabelecida", year: 1300, era: "Tuigan War", events: "1d6" },
  { roll: 5, name: "Recente", year: 1372, era: "Second Dracorage War", events: "1d6−1" },
  { roll: 6, name: "Nova", year: 1515, era: "Iron Expansion", events: "1d6−2" },
];
export const FAERUN_MONTHS = [
  "Hammer",
  "Alturiak",
  "Ches",
  "Tarsakh",
  "Mirtul",
  "Kythorn",
  "Flamerule",
  "Eleasis",
  "Eleint",
  "Marpenoth",
  "Uktar",
  "Nightal",
];
export function campaignMonth(month: number) {
  return `${FAERUN_MONTHS[((month % 12) + 12) % 12]} de ${Math.floor(month / 12)} CV`;
}

export const HOUSE_HISTORY_EVENTS = [
  {
    roll: 3,
    name: "Derrocada",
    modifiers: {
      defense: "-2d6",
      influence: "-2d6",
      law: "-2d6",
      power: "-2d6",
      population: "-2d6",
      wealth: "-2d6",
      lands: "-2d6",
    },
  },
  {
    roll: 4,
    name: "Derrota",
    modifiers: {
      defense: "-1d6",
      influence: "-1d6",
      law: "0",
      power: "-1d6",
      population: "-1d6",
      wealth: "-1d6",
      lands: "-1d6",
    },
  },
  {
    roll: 5,
    name: "Catástrofe",
    modifiers: {
      defense: "0",
      influence: "0",
      law: "-1d6",
      power: "-1d6",
      population: "-1d6",
      wealth: "-1d6",
      lands: "0",
    },
  },
  {
    roll: 6,
    name: "Loucura",
    modifiers: {
      defense: "6-2d6",
      influence: "6-2d6",
      law: "6-2d6",
      power: "6-2d6",
      population: "6-2d6",
      wealth: "6-2d6",
      lands: "6-2d6",
    },
  },
  {
    roll: 7,
    name: "Invasão/Revolta",
    modifiers: {
      defense: "0",
      influence: "0",
      law: "-2d6",
      power: "-1d6",
      population: "-1d6",
      wealth: "-1d6",
      lands: "0",
    },
  },
  {
    roll: 8,
    name: "Escândalo",
    modifiers: {
      defense: "0",
      influence: "-1d6",
      law: "0",
      power: "-1d6",
      population: "0",
      wealth: "-1d6",
      lands: "-1d6",
    },
  },
  {
    roll: 9,
    name: "Traição",
    modifiers: {
      defense: "0",
      influence: "-1d6",
      law: "-1d6",
      power: "+1d6",
      population: "0",
      wealth: "0",
      lands: "0",
    },
  },
  {
    roll: 10,
    name: "Declínio",
    modifiers: {
      defense: "0",
      influence: "-1d6",
      law: "0",
      power: "-1d6",
      population: "0",
      wealth: "-1d6",
      lands: "-1d6",
    },
  },
  { roll: 11, name: "Infraestrutura", modifiers: { choose: 2, amount: "+1d6" } },
  {
    roll: 12,
    name: "Ascensão",
    modifiers: {
      defense: "0",
      influence: "+1d6",
      law: "0",
      power: "0",
      population: "0",
      wealth: "+1d6",
      lands: "+1d6",
    },
  },
  {
    roll: 13,
    name: "Conquista",
    modifiers: {
      defense: "-1d6",
      influence: "+1d6",
      law: "0",
      power: "+1d6",
      population: "+1d6",
      wealth: "+1d6",
      lands: "+1d6",
    },
  },
  {
    roll: 14,
    name: "Favorecimento",
    modifiers: {
      defense: "0",
      influence: "+1d6",
      law: "+1d6",
      power: "+1d6",
      population: "0",
      wealth: "0",
      lands: "+1d6",
    },
  },
  {
    roll: 15,
    name: "Vitória",
    modifiers: {
      defense: "+1d6",
      influence: "+1d6",
      law: "0",
      power: "+1d6",
      population: "0",
      wealth: "0",
      lands: "0",
    },
  },
  {
    roll: 16,
    name: "Vilão",
    modifiers: {
      defense: "0",
      influence: "+1d6",
      law: "-1d6",
      power: "+1d6",
      population: "-1d6",
      wealth: "0",
      lands: "0",
    },
  },
  {
    roll: 17,
    name: "Glória",
    modifiers: {
      defense: "+1d6",
      influence: "+1d6",
      law: "+1d6",
      power: "+1d6",
      population: "0",
      wealth: "0",
      lands: "0",
    },
  },
  {
    roll: 18,
    name: "Riqueza Inesperada",
    modifiers: {
      defense: "0",
      influence: "+1d6",
      law: "0",
      power: "0",
      population: "0",
      wealth: "+2d6",
      lands: "0",
    },
  },
];
