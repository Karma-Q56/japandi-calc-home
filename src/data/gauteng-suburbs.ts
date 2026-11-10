/**
 * Suburbs the Find screen can sort by distance. Centres are approximate, so
 * distances are only about 1 km accurate. Good enough to order a list, not
 * for navigation.
 */
export type Suburb = { name: string; lat: number; lng: number };

export const GAUTENG_SUBURBS: Suburb[] = [
  { name: "Parkhurst", lat: -26.1446, lng: -28.0196 },
  { name: "Melville", lat: -26.1786, lng: -27.9998 },
  { name: "Rosebank", lat: -26.1456, lng: -28.0422 },
  { name: "Greenside", lat: -26.1448, lng: -28.0100 },
  { name: "Sandton", lat: -26.1075, lng: -28.0567 },
  { name: "Fourways", lat: -26.0169, lng: -28.0107 },
  { name: "Bryanston", lat: -26.0572, lng: -28.0153 },
  { name: "Randburg", lat: -26.0940, lng: -27.9980 },
  { name: "Northcliff", lat: -26.1000, lng: -27.9720 },
  { name: "Rivonia", lat: -26.0560, lng: -28.0530 },
  { name: "Hyde Park", lat: -26.1300, lng: -28.0400 },
  { name: "Illovo", lat: -26.1340, lng: -28.0560 },
  { name: "Braamfontein", lat: -26.1930, lng: -28.0340 },
  { name: "Maboneng", lat: -26.2050, lng: -28.0600 },
  { name: "Soweto", lat: -26.2485, lng: -27.8540 },
  { name: "Centurion", lat: -25.8603, lng: -28.1894 },
  { name: "Pretoria East", lat: -25.7800, lng: -28.2660 },
  { name: "Brooklyn", lat: -25.7720, lng: -28.2300 },
  { name: "Boksburg", lat: -26.2120, lng: -28.2580 },
  { name: "Benoni", lat: -26.1880, lng: -28.3200 },
];
