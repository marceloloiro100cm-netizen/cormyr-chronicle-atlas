import type { HouseState } from './types';

// Reconciled against the six workbooks received on 2026-10-29. See docs/house-possessions-audit-2026-10-29.md.
export const LEGACY_HOUSE_SEEDS: Record<string, HouseState> = {
  "ashkar": {
    "schemaVersion": 1,
    "houseId": "ashkar",
    "phase": "active",
    "creationStep": 9,
    "identity": {
      "region": "dragoncoast",
      "motto": "We Will Come Back",
      "foundation": 1000,
      "history": [
        "Traição",
        "Infraestrutura",
        "Vitória",
        "Favorecimento",
        "Ascensão",
        "Traição",
        "Traição"
      ],
      "notes": "Suserano: Grandragon · Lorde: Kael Ashkar · Herdeiro: Darian Ashkar · Fortaleza: Cinzaria · Arma ancestral: Phoinix"
    },
    "method": "import",
    "budget": null,
    "base": {
      "defense": 50,
      "influence": 50,
      "lands": 20,
      "law": 30,
      "population": 10,
      "power": 50,
      "wealth": 40
    },
    "permanent": {
      "defense": 0,
      "influence": 0,
      "lands": 0,
      "law": 0,
      "population": -5,
      "power": 0,
      "wealth": 1
    },
    "regionalApplied": false,
    "rolls": [],
    "domains": [
      {
        "id": "dom-ashkar-1",
        "name": "Domínio de Cinzaria (Vhal-Zar)",
        "terrain": "mountains",
        "features": [
          "ruin",
          "grassland",
          "lake-small",
          "stream"
        ],
        "notes": "Vulcão extinto de Cinzaria próximo ao Lago do Braço Longo."
      }
    ],
    "holdings": [
      {
        "id": "hold-ashkar-mountains",
        "itemId": "mountains",
        "name": "Montanha (Cinzaria)",
        "category": "terrain",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 9,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-ruin",
        "itemId": "ruin",
        "name": "Ruína de Vhal-Zar",
        "category": "feature",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 3,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-grassland",
        "itemId": "grassland",
        "name": "Pasto",
        "category": "feature",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 1,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-lake",
        "itemId": "lake-small",
        "name": "Lago Pequeno",
        "category": "feature",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-stream",
        "itemId": "stream",
        "name": "Córrego",
        "category": "feature",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 1,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-castle",
        "itemId": "superior-castle",
        "name": "Castelo Superior — Fortaleza de Cinzaria",
        "category": "fortification",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [
          {
            "kind": "defensive",
            "description": "+12 de Defesa às unidades situadas.",
            "amount": 12
          }
        ],
        "costs": [
          {
            "resource": "defense",
            "amount": 50,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-spy",
        "itemId": "pros-spy-network",
        "name": "Rede de Espiões",
        "category": "personage",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-spy-exp",
        "itemId": "pros-spy-network--expanded-network",
        "parentId": "hold-ashkar-spy",
        "name": "Rede Expandida",
        "category": "improvement",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-moa",
        "itemId": "pros-master-of-arms",
        "name": "Mestre de Armas",
        "category": "personage",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-horses",
        "itemId": "pros-horse-husbandry",
        "name": "Criação de Cavalos",
        "category": "estate",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-bloodline",
        "itemId": "pros-horse-husbandry--rare-bloodline",
        "parentId": "hold-ashkar-horses",
        "name": "Linhagem de Cavalos",
        "category": "improvement",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-heir-1",
        "itemId": "heir-firstborn",
        "name": "Primogênito — Darian Ashkar",
        "category": "personage",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "influence",
            "amount": 20,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-ashkar-vassal-1",
        "itemId": "vassal-1",
        "name": "Casa Vassala — Casa Qazir",
        "category": "vassal",
        "domainId": "dom-ashkar-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "power",
            "amount": 20,
            "mode": "allocation"
          }
        ]
      }
    ],
    "units": [
      {
        "id": "unit-ashkar-1",
        "name": "Companhia de Apoio de Cinzaria",
        "types": [
          "support"
        ],
        "training": "trained",
        "origin": "Cinzaria",
        "domainId": "dom-ashkar-1",
        "costs": [
          {
            "resource": "power",
            "amount": 7,
            "mode": "allocation"
          }
        ],
        "armor": 0,
        "armorPenalty": 0,
        "health": 6,
        "strength": 100,
        "disciplineModifier": 3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 2,
          "awareness": 2,
          "endurance": 3,
          "fighting": 2,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 3,
          "animalHandling": 3,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-ashkar-2",
        "name": "Cavalaria de Elite de Cinzaria",
        "types": [
          "cavalry"
        ],
        "training": "elite",
        "origin": "Cinzaria",
        "domainId": "dom-ashkar-1",
        "mounted": true,
        "mount": {
          "name": "Destreros de Cinzaria",
          "athletics": 4,
          "endurance": 4,
          "source": "Criação de Cavalos Ashkar"
        },
        "costs": [
          {
            "resource": "power",
            "amount": 12,
            "mode": "allocation"
          }
        ],
        "armor": 5,
        "armorPenalty": 3,
        "health": 12,
        "strength": 20,
        "disciplineModifier": -3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 3,
          "athletics": 2,
          "awareness": 2,
          "endurance": 2,
          "fighting": 5,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 5,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-ashkar-3",
        "name": "Infantaria de Elite da Fênix",
        "types": [
          "infantry"
        ],
        "training": "elite",
        "origin": "Cinzaria",
        "domainId": "dom-ashkar-1",
        "costs": [
          {
            "resource": "power",
            "amount": 11,
            "mode": "allocation"
          }
        ],
        "armor": 3,
        "armorPenalty": 2,
        "health": 12,
        "strength": 100,
        "disciplineModifier": 0,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 4,
          "awareness": 2,
          "endurance": 4,
          "fighting": 5,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      }
    ],
    "projects": [],
    "court": [
      {
        "id": "court-ashkar-1",
        "name": "Kael Ashkar",
        "role": "Lorde / Lady",
        "notes": "Lorde de Cinzaria, Aquele Que Queima"
      },
      {
        "id": "court-ashkar-2",
        "name": "Darian Ashkar",
        "role": "Herdeiro (Primogênito)",
        "notes": "Herdeiro da Casa Ashkar"
      }
    ],
    "month": 18264,
    "treasury": 0,
    "fortunes": [],
    "actions": [],
    "pending": [
      "Custos históricos da aba Casa preservados; não reprecificados pelo catálogo atual.",
      "Atribuição de domínios e detalhes narrativos herdados do cadastro anterior; distribuição não confirmada pela planilha.",
      "A seção População soma um valor rotulado Sorte da Casa. Total exibido preservado; confirmar com o Narrador se é ajuste permanente ou modificador de teste.",
      "Valores de Lei no resumo Sorte da casa são modificadores do teste, não deduções permanentes de Lei."
    ],
    "importSources": [
      "Casa Ashkar.xlsx · 29/10/2026 · Casa!B19:H19"
    ],
    "vassals": [
      {
        "id": "hold-ashkar-vassal-1",
        "houseId": "qazir",
        "name": "Qazir",
        "status": "approved",
        "cost": 20,
        "influencePenalty": 0,
        "notes": "Casa vassala vinculada à Casa Ashkar em Dragon Coast."
      }
    ]
  },
  "grantass": {
    "schemaVersion": 1,
    "houseId": "grantass",
    "phase": "active",
    "creationStep": 9,
    "identity": {
      "region": "dragoncoast",
      "motto": "We pour",
      "foundation": 322,
      "history": [
        "Catástrofe",
        "Declínio",
        "Invasão/Revolta",
        "Invasão/Revolta",
        "Glória",
        "Invasão/Revolta"
      ],
      "notes": "Suserano: Grandragon · Lady: Lady Rawena · Herdeiro: Lord Sven Grantass · Fortaleza: A Torre sem escadas · Arma: Cálice"
    },
    "method": "import",
    "budget": null,
    "base": {
      "defense": 34,
      "influence": 29,
      "lands": 30,
      "law": 2,
      "population": 14,
      "power": 20,
      "wealth": 23
    },
    "permanent": {
      "defense": 0,
      "influence": 0,
      "lands": 0,
      "law": 0,
      "population": 1,
      "power": 0,
      "wealth": 1
    },
    "regionalApplied": false,
    "rolls": [],
    "domains": [
      {
        "id": "dom-grantass-1",
        "name": "Domínio da Torre sem Escadas",
        "terrain": "wetlands",
        "community": "hamlet",
        "features": [
          "stream",
          "grassland"
        ],
        "notes": "Terras baixas, campos de ervas e povoado junto à Torre sem Escadas."
      },
      {
        "id": "dom-grantass-2",
        "name": "Montanhas e Ruínas de Grantass",
        "terrain": "mountains",
        "features": [
          "ruin",
          "woods-light"
        ],
        "notes": "Encostas montanhosas com antigas ruínas e floresta esparsa."
      }
    ],
    "holdings": [
      {
        "id": "hold-grantass-wetlands",
        "itemId": "wetlands",
        "name": "Terra Alagada (Pantanal)",
        "category": "terrain",
        "domainId": "dom-grantass-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 3,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-stream",
        "itemId": "stream",
        "name": "Córrego",
        "category": "feature",
        "domainId": "dom-grantass-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 1,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-hamlet",
        "itemId": "hamlet",
        "name": "Povoado",
        "category": "community",
        "domainId": "dom-grantass-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-grassland",
        "itemId": "grassland",
        "name": "Pasto",
        "category": "feature",
        "domainId": "dom-grantass-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 1,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-mountains",
        "itemId": "mountains",
        "name": "Montanha",
        "category": "terrain",
        "domainId": "dom-grantass-2",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 9,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-ruin",
        "itemId": "ruin",
        "name": "Ruína",
        "category": "feature",
        "domainId": "dom-grantass-2",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 3,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-woods",
        "itemId": "woods-light",
        "name": "Floresta Esparsa",
        "category": "feature",
        "domainId": "dom-grantass-2",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 3,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-tower",
        "itemId": "tower",
        "name": "Torre — A Torre sem Escadas",
        "category": "fortification",
        "domainId": "dom-grantass-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "defense",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-hall",
        "itemId": "hall",
        "name": "Salão de Grantass",
        "category": "fortification",
        "domainId": "dom-grantass-2",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "defense",
            "amount": 20,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-herbs",
        "itemId": "pros-herb-fields",
        "name": "Campos de Ervas",
        "category": "estate",
        "domainId": "dom-grantass-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-apiary",
        "itemId": "pros-apiary",
        "name": "Apiário",
        "category": "estate",
        "domainId": "dom-grantass-2",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-healing",
        "itemId": "pros-healing-site",
        "name": "Espaço de Cura (Local de Cura)",
        "category": "settlement",
        "domainId": "dom-grantass-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-artifact",
        "itemId": "pros-healing-site--actual-healing-artifact",
        "parentId": "hold-grantass-healing",
        "name": "Artefato de Cura Real (O Cálice)",
        "category": "improvement",
        "domainId": "dom-grantass-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 0,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-grantass-heir-1",
        "itemId": "heir-firstborn",
        "name": "Filho / Herdeiro — Lord Sven Grantass",
        "category": "personage",
        "domainId": "dom-grantass-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "influence",
            "amount": 20,
            "mode": "allocation"
          }
        ]
      }
    ],
    "units": [
      {
        "id": "unit-grantass-1",
        "name": "Engenheiros de Grantass",
        "types": [
          "engineers"
        ],
        "training": "trained",
        "origin": "Torre sem Escadas",
        "domainId": "dom-grantass-1",
        "costs": [
          {
            "resource": "power",
            "amount": 5,
            "mode": "allocation"
          }
        ],
        "armor": 2,
        "armorPenalty": 1,
        "health": 9,
        "strength": 100,
        "disciplineModifier": 3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 2,
          "awareness": 2,
          "endurance": 3,
          "fighting": 3,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 3,
          "survival": 2
        }
      },
      {
        "id": "unit-grantass-2",
        "name": "Patrulheiros das Ruínas",
        "types": [
          "scouts"
        ],
        "training": "trained",
        "origin": "Montanhas",
        "domainId": "dom-grantass-2",
        "costs": [
          {
            "resource": "power",
            "amount": 3,
            "mode": "allocation"
          }
        ],
        "armor": 2,
        "armorPenalty": 1,
        "health": 6,
        "strength": 100,
        "disciplineModifier": 3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Alocado parcialmente conforme original · Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 2,
          "awareness": 3,
          "endurance": 3,
          "fighting": 2,
          "marksmanship": 2,
          "stealth": 3,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-grantass-3",
        "name": "Guarda do Povoado",
        "types": [
          "garrison"
        ],
        "training": "trained",
        "origin": "Povoado",
        "domainId": "dom-grantass-1",
        "costs": [
          {
            "resource": "power",
            "amount": 3,
            "mode": "allocation"
          }
        ],
        "armor": 3,
        "armorPenalty": 2,
        "health": 9,
        "strength": 100,
        "disciplineModifier": -3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Alocado parcialmente conforme original · Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 2,
          "awareness": 3,
          "endurance": 3,
          "fighting": 3,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-grantass-4",
        "name": "Besta Pesada da Torre",
        "types": [
          "archers"
        ],
        "training": "veteran",
        "origin": "Torre sem Escadas",
        "domainId": "dom-grantass-1",
        "costs": [
          {
            "resource": "power",
            "amount": 8,
            "mode": "allocation"
          }
        ],
        "armor": 2,
        "armorPenalty": 1,
        "health": 6,
        "strength": 100,
        "disciplineModifier": 3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 3,
          "athletics": 2,
          "awareness": 3,
          "endurance": 2,
          "fighting": 2,
          "marksmanship": 5,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      }
    ],
    "projects": [],
    "court": [
      {
        "id": "court-grantass-1",
        "name": "Lady Rawena",
        "role": "Lorde / Lady",
        "notes": ""
      },
      {
        "id": "court-grantass-2",
        "name": "Lord Sven Grantass",
        "role": "Herdeiro (Primogênito)",
        "notes": ""
      }
    ],
    "month": 18264,
    "treasury": 0,
    "fortunes": [],
    "actions": [],
    "pending": [
      "Custos históricos da aba Casa preservados; não reprecificados pelo catálogo atual.",
      "Atribuição de domínios e detalhes narrativos herdados do cadastro anterior; distribuição não confirmada pela planilha.",
      "Valores de Lei no resumo Sorte da casa são modificadores do teste, não deduções permanentes de Lei."
    ],
    "importSources": [
      "Casa Grantass.xlsx · 29/10/2026 · Casa!B18:H18"
    ]
  },
  "silversky": {
    "schemaVersion": 1,
    "houseId": "silversky",
    "phase": "active",
    "creationStep": 9,
    "identity": {
      "region": "dragoncoast",
      "motto": "Always the silverlinning",
      "foundation": 1475,
      "history": [
        "Tragédia",
        "Catástrofe",
        "Vilão"
      ],
      "notes": "Suserano: Yallander · Lorde: Ashladd Silversky · Fortaleza: Torre de Silversky"
    },
    "method": "import",
    "budget": null,
    "base": {
      "defense": 21,
      "influence": 33,
      "lands": 42,
      "law": 27,
      "population": 40,
      "power": 21,
      "wealth": 37
    },
    "permanent": {
      "defense": 0,
      "influence": 0,
      "lands": 0,
      "law": 0,
      "population": 0,
      "power": 0,
      "wealth": 0
    },
    "regionalApplied": false,
    "rolls": [],
    "domains": [
      {
        "id": "dom-silversky-1",
        "name": "Domínio do Povoado de Silversky",
        "terrain": "plains",
        "community": "hamlet",
        "features": [
          "river"
        ],
        "notes": "Planícies fluviais onde fica a Torre de Silversky."
      },
      {
        "id": "dom-silversky-2",
        "name": "Colinas da Mina",
        "terrain": "hills",
        "features": [],
        "notes": "Colinas ricas em minérios."
      }
    ],
    "holdings": [
      {
        "id": "hold-silversky-plains",
        "itemId": "plains",
        "name": "Planícies",
        "category": "terrain",
        "domainId": "dom-silversky-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-silversky-hamlet",
        "itemId": "hamlet",
        "name": "Povoado",
        "category": "community",
        "domainId": "dom-silversky-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-silversky-river",
        "itemId": "river",
        "name": "Rio",
        "category": "feature",
        "domainId": "dom-silversky-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 3,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-silversky-hills",
        "itemId": "hills",
        "name": "Colinas",
        "category": "terrain",
        "domainId": "dom-silversky-2",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 7,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-silversky-mine",
        "itemId": "pros-basic-mine",
        "name": "Mina de Silversky",
        "category": "estate",
        "domainId": "dom-silversky-2",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-silversky-tower",
        "itemId": "tower",
        "name": "Torre de Silversky",
        "category": "fortification",
        "domainId": "dom-silversky-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "defense",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      }
    ],
    "units": [
      {
        "id": "unit-silversky-1",
        "name": "Guarnição de Silversky",
        "types": [
          "garrison"
        ],
        "training": "trained",
        "origin": "Silversky",
        "domainId": "dom-silversky-1",
        "costs": [
          {
            "resource": "power",
            "amount": 5,
            "mode": "allocation"
          }
        ],
        "armor": 3,
        "armorPenalty": 2,
        "health": 9,
        "strength": 100,
        "disciplineModifier": -3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 2,
          "awareness": 3,
          "endurance": 3,
          "fighting": 3,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-silversky-2",
        "name": "Infantaria Treinada de Silversky",
        "types": [
          "infantry"
        ],
        "training": "trained",
        "origin": "Silversky",
        "domainId": "dom-silversky-1",
        "costs": [
          {
            "resource": "power",
            "amount": 7,
            "mode": "allocation"
          }
        ],
        "armor": 3,
        "armorPenalty": 2,
        "health": 9,
        "strength": 100,
        "disciplineModifier": 0,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 3,
          "awareness": 2,
          "endurance": 3,
          "fighting": 3,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-silversky-3",
        "name": "Arqueiros Veteranos de Silversky",
        "types": [
          "archers"
        ],
        "training": "veteran",
        "origin": "Silversky",
        "domainId": "dom-silversky-2",
        "costs": [
          {
            "resource": "power",
            "amount": 8,
            "mode": "allocation"
          }
        ],
        "armor": 2,
        "armorPenalty": 1,
        "health": 6,
        "strength": 100,
        "disciplineModifier": 3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 3,
          "athletics": 2,
          "awareness": 3,
          "endurance": 2,
          "fighting": 2,
          "marksmanship": 5,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      }
    ],
    "projects": [],
    "court": [
      {
        "id": "court-silversky-1",
        "name": "Ashladd Silversky",
        "role": "Lorde / Lady",
        "notes": ""
      }
    ],
    "month": 18264,
    "treasury": 0,
    "fortunes": [],
    "actions": [],
    "pending": [
      "Custos históricos da aba Casa preservados; não reprecificados pelo catálogo atual.",
      "Atribuição de domínios e detalhes narrativos herdados do cadastro anterior; distribuição não confirmada pela planilha.",
      "Valores de Lei no resumo Sorte da casa são modificadores do teste, não deduções permanentes de Lei."
    ],
    "importSources": [
      "Casa Silversky.xlsx · 29/10/2026 · Casa!B13:H13"
    ]
  },
  "everlost": {
    "schemaVersion": 1,
    "houseId": "everlost",
    "phase": "active",
    "creationStep": 9,
    "identity": {
      "region": "horselands",
      "motto": "Nós sempre lembramos",
      "foundation": 1000,
      "history": [],
      "notes": "Suserano: Mantlepard · Lorde: Barão Odnot Everlost · Herdeiro: John Everlost · Fortaleza: Wind Springs · Vassalo: Casa Everet"
    },
    "method": "import",
    "budget": null,
    "base": {
      "defense": 10,
      "influence": 20,
      "lands": 20,
      "law": 40,
      "population": 29,
      "power": 80,
      "wealth": 51
    },
    "permanent": {
      "defense": 0,
      "influence": 0,
      "lands": 0,
      "law": 0,
      "population": 0,
      "power": 0,
      "wealth": 0
    },
    "regionalApplied": false,
    "rolls": [],
    "domains": [
      {
        "id": "dom-everlost-1",
        "name": "Domínio de Wind Springs",
        "terrain": "hills",
        "community": "hamlet",
        "features": [
          "woods-light"
        ],
        "notes": "Colinas de Wind Springs em Horselands."
      }
    ],
    "holdings": [
      {
        "id": "hold-everlost-hills",
        "itemId": "hills",
        "name": "Colina (Wind Springs)",
        "category": "terrain",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 7,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-everlost-hamlet",
        "itemId": "hamlet",
        "name": "Povoado de Wind Springs",
        "category": "community",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-everlost-woods",
        "itemId": "woods-light",
        "name": "Floresta Rasa (Esparsa)",
        "category": "feature",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 3,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-everlost-hall",
        "itemId": "hall",
        "name": "Salão Fortificado — Wind Springs Hall",
        "category": "fortification",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "defense",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-everlost-moa",
        "itemId": "pros-master-of-arms",
        "name": "Mestre de Armas",
        "category": "personage",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-everlost-acad",
        "itemId": "pros-military-academy",
        "name": "Academia Militar de Wind Springs",
        "category": "settlement",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "power",
            "amount": 5,
            "mode": "allocation"
          },
          {
            "resource": "wealth",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-everlost-broad",
        "itemId": "pros-military-academy--broad-training",
        "parentId": "hold-everlost-acad",
        "name": "Treinamento Amplo (Broad Training)",
        "category": "improvement",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-everlost-weapons",
        "itemId": "pros-bowyer-fletcher-or-weaponsmith",
        "name": "Melhoria de Armas / Armaria",
        "category": "equipment",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 6,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-everlost-kennels",
        "itemId": "pros-dog-kennels",
        "name": "Canil de Guerra (Dog Kennels + Cães de Guerra)",
        "category": "estate",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 20,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-everlost-heir-1",
        "itemId": "heir-firstborn",
        "name": "Primogênito — John Everlost",
        "category": "personage",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "influence",
            "amount": 20,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-everlost-vassal-1",
        "itemId": "vassal-1",
        "name": "Casa Vassala — Casa Everet",
        "category": "vassal",
        "domainId": "dom-everlost-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "power",
            "amount": 20,
            "mode": "allocation"
          }
        ]
      }
    ],
    "units": [
      {
        "id": "unit-everlost-1",
        "name": "1ª Infantaria Veterana de Wind Springs",
        "types": [
          "infantry"
        ],
        "training": "veteran",
        "origin": "Wind Springs",
        "domainId": "dom-everlost-1",
        "costs": [
          {
            "resource": "power",
            "amount": 9,
            "mode": "allocation"
          }
        ],
        "armor": 4,
        "armorPenalty": 2,
        "health": 12,
        "strength": 100,
        "disciplineModifier": 0,
        "equipment": [
          "armor",
          "fighting"
        ],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 3,
          "awareness": 2,
          "endurance": 4,
          "fighting": 4,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-everlost-2",
        "name": "2ª Infantaria Veterana de Wind Springs",
        "types": [
          "infantry"
        ],
        "training": "veteran",
        "origin": "Wind Springs",
        "domainId": "dom-everlost-1",
        "costs": [
          {
            "resource": "power",
            "amount": 9,
            "mode": "allocation"
          }
        ],
        "armor": 4,
        "armorPenalty": 2,
        "health": 12,
        "strength": 100,
        "disciplineModifier": 0,
        "equipment": [
          "armor",
          "fighting"
        ],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 3,
          "awareness": 2,
          "endurance": 4,
          "fighting": 4,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-everlost-3",
        "name": "3ª Infantaria Veterana de Wind Springs",
        "types": [
          "infantry"
        ],
        "training": "veteran",
        "origin": "Wind Springs",
        "domainId": "dom-everlost-1",
        "costs": [
          {
            "resource": "power",
            "amount": 9,
            "mode": "allocation"
          }
        ],
        "armor": 4,
        "armorPenalty": 2,
        "health": 12,
        "strength": 100,
        "disciplineModifier": 0,
        "equipment": [
          "fighting"
        ],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 3,
          "awareness": 2,
          "endurance": 4,
          "fighting": 4,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-everlost-4",
        "name": "Arqueiros Veteranos de Wind Springs",
        "types": [
          "archers"
        ],
        "training": "veteran",
        "origin": "Wind Springs",
        "domainId": "dom-everlost-1",
        "costs": [
          {
            "resource": "power",
            "amount": 8,
            "mode": "allocation"
          }
        ],
        "armor": 2,
        "armorPenalty": 1,
        "health": 6,
        "strength": 100,
        "disciplineModifier": 3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 3,
          "athletics": 2,
          "awareness": 3,
          "endurance": 2,
          "fighting": 2,
          "marksmanship": 5,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-everlost-5",
        "name": "1ª Cavalaria Veterana de Everlost",
        "types": [
          "cavalry"
        ],
        "training": "veteran",
        "origin": "Wind Springs",
        "domainId": "dom-everlost-1",
        "mounted": true,
        "mount": {
          "name": "Corcéis das Horselands",
          "athletics": 4,
          "endurance": 4,
          "source": "Horselands"
        },
        "costs": [
          {
            "resource": "power",
            "amount": 10,
            "mode": "allocation"
          }
        ],
        "armor": 5,
        "armorPenalty": 3,
        "health": 12,
        "strength": 20,
        "disciplineModifier": -3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 3,
          "athletics": 2,
          "awareness": 2,
          "endurance": 2,
          "fighting": 4,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 4,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-everlost-6",
        "name": "2ª Cavalaria Veterana de Everlost",
        "types": [
          "cavalry"
        ],
        "training": "veteran",
        "origin": "Wind Springs",
        "domainId": "dom-everlost-1",
        "mounted": true,
        "mount": {
          "name": "Corcéis das Horselands",
          "athletics": 4,
          "endurance": 4,
          "source": "Horselands"
        },
        "costs": [
          {
            "resource": "power",
            "amount": 10,
            "mode": "allocation"
          }
        ],
        "armor": 5,
        "armorPenalty": 3,
        "health": 12,
        "strength": 20,
        "disciplineModifier": -3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 3,
          "athletics": 2,
          "awareness": 2,
          "endurance": 2,
          "fighting": 4,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 4,
          "warfare": 2,
          "survival": 2
        }
      }
    ],
    "projects": [],
    "court": [
      {
        "id": "court-everlost-1",
        "name": "Barão Odnot Everlost",
        "role": "Lorde / Lady",
        "notes": ""
      },
      {
        "id": "court-everlost-2",
        "name": "John Everlost",
        "role": "Herdeiro (Primogênito)",
        "notes": ""
      }
    ],
    "month": 18264,
    "treasury": 0,
    "fortunes": [],
    "actions": [],
    "pending": [
      "Custos históricos da aba Casa preservados; não reprecificados pelo catálogo atual.",
      "Atribuição de domínios e detalhes narrativos herdados do cadastro anterior; distribuição não confirmada pela planilha.",
      "Valores de Lei no resumo Sorte da casa são modificadores do teste, não deduções permanentes de Lei."
    ],
    "importSources": [
      "Casa Everlost.xlsx · 29/10/2026 · Casa!B14:H14"
    ],
    "vassals": [
      {
        "id": "hold-everlost-vassal-1",
        "houseId": "everet",
        "name": "Everet",
        "status": "approved",
        "cost": 20,
        "influencePenalty": 0,
        "notes": "Casa vassala de Everlost."
      }
    ]
  },
  "erdenor": {
    "schemaVersion": 1,
    "houseId": "erdenor",
    "phase": "active",
    "creationStep": 9,
    "identity": {
      "region": "horselands",
      "motto": "We Grow",
      "foundation": 1513,
      "history": [
        "Vilão",
        "Escândalo"
      ],
      "notes": "Suserano: Yallander · Herdeiro: Corvaen Erdenor · Fortaleza: Goldenbull Tower"
    },
    "method": "import",
    "budget": null,
    "base": {
      "defense": 19,
      "influence": 30,
      "lands": 40,
      "law": 30,
      "population": 42,
      "power": 30,
      "wealth": 55
    },
    "permanent": {
      "defense": 0,
      "influence": 1,
      "lands": 0,
      "law": 0,
      "population": 2,
      "power": 0,
      "wealth": 1
    },
    "regionalApplied": false,
    "rolls": [],
    "domains": [
      {
        "id": "dom-erdenor-1",
        "name": "Domínio de Goldenbull Tower",
        "terrain": "plains",
        "community": "hamlet",
        "features": [
          "river",
          "road",
          "grassland",
          "ruin"
        ],
        "notes": "Planície central de Goldenbull Tower."
      },
      {
        "id": "dom-erdenor-2",
        "name": "Pradarias Orientais de Erdenor",
        "terrain": "plains",
        "features": [
          "road",
          "grassland"
        ],
        "notes": "Segundo domínio de planícies e estradas."
      }
    ],
    "holdings": [
      {
        "id": "hold-erdenor-plains-1",
        "itemId": "plains",
        "name": "Planície de Goldenbull",
        "category": "terrain",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-river",
        "itemId": "river",
        "name": "Rio",
        "category": "feature",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 3,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-road-1",
        "itemId": "road",
        "name": "Estrada Principal",
        "category": "feature",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-grassland-1",
        "itemId": "grassland",
        "name": "Pasto Norte",
        "category": "feature",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 1,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-ruin",
        "itemId": "ruin",
        "name": "Ruína",
        "category": "feature",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 3,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-hamlet",
        "itemId": "hamlet",
        "name": "Povoado de Goldenbull",
        "category": "community",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-plains-2",
        "itemId": "plains",
        "name": "Planície Oriental",
        "category": "terrain",
        "domainId": "dom-erdenor-2",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-road-2",
        "itemId": "road",
        "name": "Estrada Comercial",
        "category": "feature",
        "domainId": "dom-erdenor-2",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-grassland-2",
        "itemId": "grassland",
        "name": "Pasto Sul",
        "category": "feature",
        "domainId": "dom-erdenor-2",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 1,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-tower",
        "itemId": "tower",
        "name": "Torre — Goldenbull Tower",
        "category": "fortification",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "defense",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-bm",
        "itemId": "pros-black-market",
        "name": "Mercado Clandestino (Mercado Negro)",
        "category": "settlement",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-spy",
        "itemId": "pros-spy-network",
        "name": "Rede de Espiões",
        "category": "personage",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-abbey",
        "itemId": "pros-abbey",
        "name": "Abadia",
        "category": "settlement",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-agri",
        "itemId": "pros-food-agriculture",
        "name": "Agricultura Alimentar",
        "category": "estate",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-granary",
        "itemId": "pros-food-agriculture--granaries",
        "parentId": "hold-erdenor-agri",
        "name": "Celeiros (Granary)",
        "category": "improvement",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-heir-1",
        "itemId": "heir-firstborn",
        "name": "Primogênito — Corvaen Erdenor",
        "category": "personage",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "influence",
            "amount": 20,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-erdenor-heir-2",
        "itemId": "heir-second",
        "name": "Segundo Filho de Erdenor",
        "category": "personage",
        "domainId": "dom-erdenor-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "influence",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      }
    ],
    "units": [
      {
        "id": "unit-erdenor-1",
        "name": "Saqueadores de Erdenor",
        "types": [
          "raiders"
        ],
        "training": "veteran",
        "origin": "Goldenbull Tower",
        "domainId": "dom-erdenor-1",
        "costs": [
          {
            "resource": "power",
            "amount": 8,
            "mode": "allocation"
          }
        ],
        "armor": 2,
        "armorPenalty": 1,
        "health": 12,
        "strength": 100,
        "disciplineModifier": 3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Dano: Atletismo +1 · Defesa: 6",
        "skills": {
          "fighting": 4,
          "marksmanship": 2,
          "agility": 2,
          "athletics": 3,
          "stealth": 2,
          "cunning": 2,
          "endurance": 4,
          "awareness": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-erdenor-2",
        "name": "As Sombras das Pradarias",
        "types": [
          "criminals"
        ],
        "training": "veteran",
        "origin": "Erdenor",
        "domainId": "dom-erdenor-1",
        "costs": [
          {
            "resource": "power",
            "amount": 6,
            "mode": "allocation"
          }
        ],
        "armor": 1,
        "armorPenalty": 0,
        "health": 6,
        "strength": 100,
        "disciplineModifier": 6,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Dano: Atletismo +1 · Defesa: 7",
        "skills": {
          "fighting": 2,
          "marksmanship": 2,
          "agility": 2,
          "athletics": 3,
          "stealth": 4,
          "cunning": 4,
          "endurance": 2,
          "awareness": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      }
    ],
    "projects": [],
    "court": [
      {
        "id": "court-erdenor-1",
        "name": "Corvaen Erdenor",
        "role": "Herdeiro (Primogênito)",
        "notes": ""
      }
    ],
    "month": 18264,
    "treasury": 0,
    "fortunes": [],
    "actions": [],
    "pending": [
      "Custos históricos da aba Casa preservados; não reprecificados pelo catálogo atual.",
      "Atribuição de domínios e detalhes narrativos herdados do cadastro anterior; distribuição não confirmada pela planilha.",
      "Casa!E30 omite o Pasto E29 (-1): saldo de Terras corrigido de 3 para 2.",
      "Valores de Lei no resumo Sorte da casa são modificadores do teste, não deduções permanentes de Lei."
    ],
    "importSources": [
      "Casa Erdenor.xlsx · 29/10/2026 · Casa!B14:H14"
    ]
  },
  "fewmerry": {
    "schemaVersion": 1,
    "houseId": "fewmerry",
    "phase": "active",
    "creationStep": 9,
    "identity": {
      "region": "dragoncoast",
      "motto": "Forward - Adiante",
      "foundation": 1372,
      "history": [
        "Vitória",
        "Invasão"
      ],
      "notes": "Região: Dragon Coast · Fundação: 1372 CV"
    },
    "method": "import",
    "budget": null,
    "base": {
      "defense": 31,
      "influence": 48,
      "lands": 27,
      "law": 22,
      "population": 35,
      "power": 32,
      "wealth": 51
    },
    "permanent": {
      "defense": 0,
      "influence": 0,
      "lands": 0,
      "law": 0,
      "population": 3,
      "power": 0,
      "wealth": 0
    },
    "regionalApplied": false,
    "rolls": [],
    "domains": [
      {
        "id": "dom-fewmerry-1",
        "name": "Domínio Costeiro de Fewmerry",
        "terrain": "plains",
        "community": "hamlet",
        "features": [
          "river",
          "road",
          "woods-light",
          "grassland"
        ],
        "notes": "Terras costeiras e fluviais em Dragon Coast."
      }
    ],
    "holdings": [
      {
        "id": "hold-fewmerry-plains",
        "itemId": "plains",
        "name": "Planície",
        "category": "terrain",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-hamlet",
        "itemId": "hamlet",
        "name": "Povoado",
        "category": "community",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-river",
        "itemId": "river",
        "name": "Rio",
        "category": "feature",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 3,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-road",
        "itemId": "road",
        "name": "Estrada",
        "category": "feature",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-woods",
        "itemId": "woods-light",
        "name": "Floresta Esparsa",
        "category": "feature",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 3,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-grassland",
        "itemId": "grassland",
        "name": "Pasto",
        "category": "feature",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "lands",
            "amount": 1,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-hall",
        "itemId": "hall",
        "name": "Salão Pequeno de Fewmerry",
        "category": "fortification",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "defense",
            "amount": 20,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-tower",
        "itemId": "tower",
        "name": "Torre de Vigia",
        "category": "fortification",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "defense",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-court",
        "itemId": "pros-court",
        "name": "Corte (Court)",
        "category": "lifestyle",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-fest",
        "itemId": "pros-seasonal-festivals",
        "name": "Festivais Sazonais (Seasonal Festival)",
        "category": "lifestyle",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-entourage",
        "itemId": "pros-standard-of-living--entourage",
        "name": "Padrão de Vida — Séquito (Standard of Life: Entourage)",
        "category": "lifestyle",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 6,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-timber",
        "itemId": "pros-timber",
        "name": "Exploração Madeireira (Timber)",
        "category": "estate",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-mill",
        "itemId": "pros-timber--lumber-mill",
        "parentId": "hold-fewmerry-timber",
        "name": "Serraria (Lumber Mill)",
        "category": "improvement",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-inn",
        "itemId": "pros-trading-inn",
        "name": "Estalagem Comercial (Trading Inn)",
        "category": "settlement",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-inn-growth",
        "itemId": "pros-trading-inn--growth",
        "parentId": "hold-fewmerry-inn",
        "name": "Crescimento da Estalagem (Trading Inn: Growth)",
        "category": "improvement",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-toll",
        "itemId": "pros-tolls",
        "name": "Pedágios (Toll)",
        "category": "settlement",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "wealth",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-heir-1",
        "itemId": "heir-firstborn",
        "name": "Primogênito de Fewmerry",
        "category": "personage",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "influence",
            "amount": 20,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-heir-2",
        "itemId": "heir-second",
        "name": "Segundo Filho de Fewmerry",
        "category": "personage",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "influence",
            "amount": 10,
            "mode": "allocation"
          }
        ]
      },
      {
        "id": "hold-fewmerry-heir-3",
        "itemId": "heir-third",
        "name": "Terceiro Filho de Fewmerry",
        "category": "personage",
        "domainId": "dom-fewmerry-1",
        "status": "active",
        "ruleVersion": "1",
        "source": "Legacy",
        "effects": [],
        "costs": [
          {
            "resource": "influence",
            "amount": 5,
            "mode": "allocation"
          }
        ]
      }
    ],
    "units": [
      {
        "id": "unit-fewmerry-1",
        "name": "Batedores de Fewmerry",
        "types": [
          "scouts"
        ],
        "training": "trained",
        "origin": "Fewmerry",
        "domainId": "dom-fewmerry-1",
        "costs": [
          {
            "resource": "power",
            "amount": 5,
            "mode": "allocation"
          }
        ],
        "armor": 2,
        "armorPenalty": 1,
        "health": 6,
        "strength": 100,
        "disciplineModifier": 3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 2,
          "awareness": 3,
          "endurance": 3,
          "fighting": 2,
          "marksmanship": 2,
          "stealth": 3,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-fewmerry-2",
        "name": "Infantaria de Fewmerry",
        "types": [
          "infantry"
        ],
        "training": "trained",
        "origin": "Fewmerry",
        "domainId": "dom-fewmerry-1",
        "costs": [
          {
            "resource": "power",
            "amount": 5,
            "mode": "allocation"
          }
        ],
        "armor": 3,
        "armorPenalty": 2,
        "health": 9,
        "strength": 100,
        "disciplineModifier": 0,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 3,
          "awareness": 2,
          "endurance": 3,
          "fighting": 3,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-fewmerry-3",
        "name": "Companhia de Apoio de Fewmerry",
        "types": [
          "support"
        ],
        "training": "trained",
        "origin": "Fewmerry",
        "domainId": "dom-fewmerry-1",
        "costs": [
          {
            "resource": "power",
            "amount": 7,
            "mode": "allocation"
          }
        ],
        "armor": 0,
        "armorPenalty": 0,
        "health": 9,
        "strength": 100,
        "disciplineModifier": 3,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 2,
          "awareness": 2,
          "endurance": 3,
          "fighting": 2,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 3,
          "animalHandling": 3,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-fewmerry-4",
        "name": "Marinheiros de Fewmerry",
        "types": [
          "sailors"
        ],
        "training": "trained",
        "origin": "Porto Fluvial de Fewmerry",
        "domainId": "dom-fewmerry-1",
        "costs": [
          {
            "resource": "power",
            "amount": 7,
            "mode": "allocation"
          }
        ],
        "armor": 0,
        "armorPenalty": 0,
        "health": 6,
        "strength": 100,
        "disciplineModifier": 0,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 3,
          "athletics": 2,
          "awareness": 3,
          "endurance": 2,
          "fighting": 3,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      },
      {
        "id": "unit-fewmerry-5",
        "name": "Esquadra de Navios de Guerra de Fewmerry",
        "types": [
          "warships"
        ],
        "training": "green",
        "origin": "Dragon Coast",
        "domainId": "dom-fewmerry-1",
        "costs": [
          {
            "resource": "power",
            "amount": 8,
            "mode": "allocation"
          }
        ],
        "armor": 5,
        "armorPenalty": 0,
        "health": 6,
        "strength": 5,
        "disciplineModifier": 0,
        "equipment": [],
        "situation": "Pronta",
        "atHome": true,
        "mounted": false,
        "casualties": 0,
        "xp": 0,
        "notes": "Tipo, treinamento e custo conferidos na aba Casa; atributos detalhados herdados não confirmados. Aba Exercito contém modelo vazio ou tropas de outra casa.",
        "skills": {
          "agility": 2,
          "athletics": 2,
          "awareness": 3,
          "endurance": 2,
          "fighting": 2,
          "marksmanship": 2,
          "stealth": 2,
          "cunning": 2,
          "healing": 2,
          "animalHandling": 2,
          "warfare": 2,
          "survival": 2
        }
      }
    ],
    "projects": [],
    "court": [],
    "month": 18264,
    "treasury": 0,
    "fortunes": [],
    "actions": [],
    "pending": [
      "Custos históricos da aba Casa preservados; não reprecificados pelo catálogo atual.",
      "Atribuição de domínios e detalhes narrativos herdados do cadastro anterior; distribuição não confirmada pela planilha.",
      "A seção População soma um valor rotulado Sorte da Casa. Total exibido preservado; confirmar com o Narrador se é ajuste permanente ou modificador de teste.",
      "Valores de Lei no resumo Sorte da casa são modificadores do teste, não deduções permanentes de Lei."
    ],
    "importSources": [
      "Casa Fewmerry.xlsx · 29/10/2026 · Casa!B14:H14"
    ]
  }
};
