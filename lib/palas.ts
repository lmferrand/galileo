// Medidas de la imagen de cada pala. Todo va en píxeles de la imagen recortada y
// el componente Pala lo pasa a porcentajes, así encaja a cualquier tamaño.
// Si cambia una imagen: renombrarla (la caché sin conexión es cache-first) y
// volver a medir. Las cuerdas van de la más grave a la más aguda. Las imágenes
// acaban justo en la cejuela: el diapasón entero lo dibuja Pala (sin corte).

export interface Punto {
  x: number;
  y: number;
}

export interface GeometriaPala {
  imagen: { src: string; srcSet: string; ancho: number; alto: number };
  /** Centro de cada llave (el botón que se toca) y hacia qué lado mira. */
  llaves: (Punto & { lado: "izq" | "der" })[];
  /** Tamaño de la llave y de la nota que lleva, en % del ancho de la pala. */
  llave: { ancho: number; alto: number; letra: number };
  /** Centro de cada poste, donde se enciende la luz. */
  postes: Punto[];
  radioPoste: number;
  /** Recorrido de cada cuerda en la imagen, medido fila a fila: de su poste al borde de abajo. */
  recorridos: [number, number][][];
  grosor: number[];
  /** Cuántas cuerdas (empezando por la más grave) son entorchadas. */
  entorchadas: number;
  /** Bronce (acústica) o níquel (eléctrica y bajo). */
  metal: "bronce" | "niquel";
  /** El mástil dibujado debajo de la imagen hasta el borde de la pantalla. */
  mastil: {
    x0: number;
    x1: number;
    filete: number;
    madera: [string, string, string];
    colorFilete: [string, string, string];
    /** Dónde acaba la cejuela y lo que mide el primer traste. */
    cejuela: number;
    paso: number;
  };
}

export const PALA_ACUSTICA: GeometriaPala = {
  imagen: {
    src: "/pala/clavijero6-815.webp",
    srcSet: "/pala/clavijero6-500.webp 500w, /pala/clavijero6-815.webp 815w",
    ancho: 815,
    alto: 1340,
  },
  // Las tres graves a la izquierda (de abajo arriba) y las tres agudas a la derecha.
  llaves: [
    { x: 68, y: 856, lado: "izq" },
    { x: 68, y: 636, lado: "izq" },
    { x: 68, y: 421, lado: "izq" },
    { x: 745, y: 416, lado: "der" },
    { x: 745, y: 631, lado: "der" },
    { x: 745, y: 851, lado: "der" },
  ],
  llave: { ancho: 19.5, alto: 12.5, letra: 6.6 },
  postes: [
    { x: 255, y: 846 },
    { x: 258, y: 631 },
    { x: 250, y: 416 },
    { x: 555, y: 411 },
    { x: 550, y: 631 },
    { x: 555, y: 846 },
  ],
  radioPoste: 46,
  recorridos: [
    [[281, 868], [280, 900], [279, 950], [278, 1100], [276, 1200], [275, 1290], [274, 1360]],
    [[286, 655], [288, 700], [291, 760], [293, 800], [299, 870], [301, 900], [303, 950], [306, 1000], [312, 1100], [318, 1200], [323, 1290], [324, 1360]],
    [[280, 445], [284, 470], [290, 520], [298, 600], [306, 660], [310, 700], [316, 760], [321, 800], [330, 870], [333, 900], [338, 950], [343, 1000], [355, 1100], [367, 1200], [372, 1250], [375, 1290], [377, 1360]],
    [[535, 440], [527, 470], [520, 520], [512, 600], [505, 660], [500, 700], [493, 760], [489, 800], [481, 870], [478, 900], [473, 950], [468, 1000], [456, 1100], [445, 1200], [439, 1250], [434, 1290], [431, 1320], [431, 1360]],
    [[527, 655], [525, 700], [521, 760], [520, 800], [515, 870], [513, 900], [510, 950], [507, 1000], [500, 1100], [492, 1200], [488, 1250], [485, 1290], [483, 1320], [483, 1360]],
    [[533, 868], [533, 950], [534, 1100], [535, 1200], [535, 1360]],
  ],
  grosor: [10, 9, 8, 6, 5, 4.5],
  entorchadas: 3,
  metal: "bronce",
  mastil: {
    x0: 237,
    x1: 568,
    filete: 12,
    madera: ["#240f09", "#36180f", "#220e08"],
    colorFilete: ["#a8782c", "#f7d98f", "#8a6122"],
    cejuela: 1341,
    paso: 274,
  },
};

export const PALA_BAJO: GeometriaPala = {
  imagen: {
    src: "/pala/bajo4-806.webp",
    srcSet: "/pala/bajo4-500.webp 500w, /pala/bajo4-806.webp 806w",
    ancho: 806,
    alto: 1168,
  },
  // 2 + 2: la 4.ª abajo a la izquierda, la 3.ª arriba a la izquierda, la 2.ª arriba a la derecha y la 1.ª abajo a la derecha.
  llaves: [
    { x: 68, y: 723, lado: "izq" },
    { x: 72, y: 435, lado: "izq" },
    { x: 728, y: 435, lado: "der" },
    { x: 738, y: 725, lado: "der" },
  ],
  llave: { ancho: 13.5, alto: 17.5, letra: 6 },
  postes: [
    { x: 248, y: 710 },
    { x: 248, y: 411 },
    { x: 548, y: 411 },
    { x: 552, y: 710 },
  ],
  radioPoste: 50,
  recorridos: [
    [[291, 751], [290, 766], [289, 816], [288, 866], [285, 916], [283, 966], [281, 1016], [281, 1066], [279, 1116], [279, 1166], [278, 1216], [277, 1316], [277, 1433]],
    [[297, 451], [299, 466], [303, 516], [308, 566], [313, 616], [318, 666], [323, 716], [327, 766], [332, 816], [337, 866], [341, 916], [346, 966], [351, 1016], [355, 1066], [360, 1116], [362, 1166], [362, 1433]],
    [[501, 451], [499, 466], [495, 516], [491, 566], [487, 616], [483, 666], [479, 716], [474, 766], [470, 816], [466, 866], [462, 916], [458, 966], [454, 1016], [450, 1066], [447, 1116], [445, 1166], [445, 1433]],
    [[508, 751], [509, 766], [512, 816], [513, 866], [516, 916], [518, 966], [520, 1016], [522, 1066], [523, 1116], [524, 1166], [524, 1216], [525, 1316], [525, 1433]],
  ],
  grosor: [15, 13.5, 12, 10.5],
  entorchadas: 4,
  metal: "niquel",
  mastil: {
    x0: 232,
    x1: 564,
    filete: 12,
    madera: ["#2b150d", "#43221a", "#2b150d"],
    colorFilete: ["#e3c896", "#fff2d4", "#dcc08a"],
    cejuela: 1168,
    paso: 192,
  },
};

export const PALA_ELECTRICA: GeometriaPala = {
  imagen: {
    src: "/pala/electrica4-746.webp",
    srcSet: "/pala/electrica4-500.webp 500w, /pala/electrica4-746.webp 746w",
    ancho: 746,
    alto: 1209,
  },
  // 3 + 3 como la acústica: las graves a la izquierda (de abajo arriba), las agudas a la derecha.
  llaves: [
    { x: 56, y: 816, lado: "izq" },
    { x: 74, y: 589, lado: "izq" },
    { x: 67, y: 364, lado: "izq" },
    { x: 684, y: 356, lado: "der" },
    { x: 692, y: 584, lado: "der" },
    { x: 700, y: 812, lado: "der" },
  ],
  llave: { ancho: 13.5, alto: 15.5, letra: 5.8 },
  postes: [
    { x: 211, y: 819 },
    { x: 224, y: 589 },
    { x: 224, y: 359 },
    { x: 532, y: 349 },
    { x: 536, y: 584 },
    { x: 540, y: 819 },
  ],
  radioPoste: 44,
  recorridos: [
    [[232, 824], [234, 834], [238, 914], [240, 1034], [240, 1154], [240, 1206], [240, 1441]],
    [[238, 606], [256, 794], [265, 894], [274, 994], [283, 1094], [290, 1154], [291, 1206], [291, 1441]],
    [[250, 374], [294, 754], [310, 874], [324, 994], [337, 1114], [340, 1154], [342, 1206], [342, 1441]],
    [[514, 372], [465, 734], [453, 834], [442, 914], [431, 994], [420, 1074], [406, 1154], [400, 1206], [400, 1441]],
    [[514, 604], [480, 914], [471, 994], [462, 1074], [454, 1154], [451, 1206], [451, 1441]],
    [[516, 836], [514, 914], [510, 994], [506, 1074], [505, 1154], [503, 1206], [502, 1441]],
  ],
  grosor: [8, 7, 6, 5, 4.2, 3.6],
  entorchadas: 3,
  metal: "niquel",
  mastil: {
    x0: 210,
    x1: 522,
    filete: 7,
    madera: ["#6a2809", "#8e3a12", "#6a2809"],
    colorFilete: ["#d9b87f", "#f5e2b8", "#d4b07a"],
    cejuela: 1206,
    paso: 175,
  },
};
