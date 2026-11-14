/** Twenty professional portraits from the Narrator's Drive folder.
 * All are now optimized and hosted as versioned site assets. The reference
 * image was deliberately excluded; custom portraits keep their URLs.
 */
export const spyPortraitManifest=[
  {
    "id": "espiao-tillet",
    "label": "Tillet",
    "src": "/spy-portraits/tillet.jpg",
    "sort": 1,
    "kind": "local"
  },
  {
    "id": "espiao-estivadora",
    "label": "Estivadora",
    "src": "/spy-portraits/estivadora.jpg",
    "sort": 2,
    "kind": "local"
  },
  {
    "id": "espiao-cortesa",
    "label": "Cortesã",
    "src": "/spy-portraits/cortesa.jpg",
    "sort": 3,
    "kind": "local"
  },
  {
    "id": "espiao-vigia",
    "label": "Vigia",
    "src": "/spy-portraits/vigia.jpg",
    "sort": 4,
    "kind": "local"
  },
  {
    "id": "espiao-ladina",
    "label": "Ladina",
    "src": "/spy-portraits/ladina.jpg",
    "sort": 5,
    "kind": "local"
  },
  {
    "id": "espiao-taverneiro",
    "label": "Taverneiro",
    "src": "/spy-portraits/taverneiro.jpg",
    "sort": 6,
    "kind": "local"
  },
  {
    "id": "espiao-assassino",
    "label": "Assassino",
    "src": "/spy-portraits/assassino.jpg",
    "sort": 7,
    "kind": "local"
  },
  {
    "id": "espiao-cozinheira",
    "label": "Cozinheira",
    "src": "/spy-portraits/cozinheira.jpg",
    "sort": 8,
    "kind": "local"
  },
  {
    "id": "espiao-escriba",
    "label": "Escriba",
    "src": "/spy-portraits/escriba.jpg",
    "sort": 9,
    "kind": "local"
  },
  {
    "id": "espiao-bardo",
    "label": "Bardo",
    "src": "/spy-portraits/bardo.jpg",
    "sort": 10,
    "kind": "local"
  },
  {
    "id": "espiao-ferreiro",
    "label": "Ferreiro",
    "src": "/spy-portraits/ferreiro.jpg",
    "sort": 11,
    "kind": "local"
  },
  {
    "id": "espiao-mensageira",
    "label": "Mensageira",
    "src": "/spy-portraits/mensageira.jpg",
    "sort": 12,
    "kind": "local"
  },
  {
    "id": "espiao-mendiga",
    "label": "Mendiga",
    "src": "/spy-portraits/mendiga.jpg",
    "sort": 13,
    "kind": "local"
  },
  {
    "id": "espiao-cacador",
    "label": "Caçador",
    "src": "/spy-portraits/cacador.jpg",
    "sort": 14,
    "kind": "local"
  },
  {
    "id": "espiao-nobre",
    "label": "Nobre",
    "src": "/spy-portraits/nobre.jpg",
    "sort": 15,
    "kind": "local"
  },
  {
    "id": "espiao-mercador",
    "label": "Mercador",
    "src": "/spy-portraits/mercador.jpg",
    "sort": 16,
    "kind": "local"
  },
  {
    "id": "espiao-camponesa",
    "label": "Camponesa",
    "src": "/spy-portraits/camponesa.jpg",
    "sort": 17,
    "kind": "local"
  },
  {
    "id": "espiao-contador",
    "label": "Contador",
    "src": "/spy-portraits/contador.jpg",
    "sort": 18,
    "kind": "local"
  },
  {
    "id": "espiao-guarda",
    "label": "Guarda",
    "src": "/spy-portraits/guarda.jpg",
    "sort": 19,
    "kind": "local"
  },
  {
    "id": "espiao-ladrao",
    "label": "Ladrão",
    "src": "/spy-portraits/ladrao.jpg",
    "sort": 20,
    "kind": "local"
  }
] as const;

/** Present local URLs immediately, even if the SQL migration has not yet run.
 * IDs outside the official twenty retain the database URL without change.
 */
export function resolveSpyPortraitImageUrl(id:string,sourceUrl:string):string{
 return spyPortraitManifest.find(p=>p.id===id)?.src??sourceUrl;
}
