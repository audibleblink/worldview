/**
 * WorldView - Airline Code Utilities
 * IATA to ICAO airline code conversion
 */

/**
 * IATA (2-letter) to ICAO (3-letter) airline code lookup table
 * Contains 50 major carriers for callsign normalization
 */
export const IATA_TO_ICAO: Record<string, string> = {
  // North America
  AA: "AAL", // American Airlines
  UA: "UAL", // United Airlines
  DL: "DAL", // Delta Air Lines
  WN: "SWA", // Southwest Airlines
  AS: "ASA", // Alaska Airlines
  B6: "JBU", // JetBlue Airways
  NK: "NKS", // Spirit Airlines
  F9: "FFT", // Frontier Airlines
  G4: "AAY", // Allegiant Air
  HA: "HAL", // Hawaiian Airlines
  SY: "SCX", // Sun Country Airlines
  AC: "ACA", // Air Canada
  WS: "WJA", // WestJet
  AM: "AMX", // Aeromexico

  // Europe
  BA: "BAW", // British Airways
  LH: "DLH", // Lufthansa
  AF: "AFR", // Air France
  KL: "KLM", // KLM Royal Dutch Airlines
  IB: "IBE", // Iberia
  AY: "FIN", // Finnair
  SK: "SAS", // Scandinavian Airlines
  LX: "SWR", // Swiss International Air Lines
  OS: "AUA", // Austrian Airlines
  TP: "TAP", // TAP Air Portugal
  AZ: "ITY", // ITA Airways
  TK: "THY", // Turkish Airlines
  EI: "EIN", // Aer Lingus
  VS: "VIR", // Virgin Atlantic

  // Middle East
  EK: "UAE", // Emirates
  QR: "QTR", // Qatar Airways
  EY: "ETD", // Etihad Airways
  SV: "SVA", // Saudia

  // Asia Pacific
  QF: "QFA", // Qantas
  NZ: "ANZ", // Air New Zealand
  SQ: "SIA", // Singapore Airlines
  CX: "CPA", // Cathay Pacific
  JL: "JAL", // Japan Airlines
  NH: "ANA", // All Nippon Airways
  KE: "KAL", // Korean Air
  OZ: "AAR", // Asiana Airlines
  CI: "CAL", // China Airlines
  BR: "EVA", // EVA Air
  CA: "CCA", // Air China
  MU: "CES", // China Eastern Airlines
  CZ: "CSN", // China Southern Airlines
  AI: "AIC", // Air India

  // Latin America / Africa
  LA: "LAN", // LATAM Airlines
  AV: "AVA", // Avianca
  CM: "CMP", // Copa Airlines
  SA: "SAA", // South African Airways
};

/**
 * Convert a callsign with IATA prefix to ICAO format
 * Examples:
 *   "UA100" → "UAL100"
 *   "AAL100" → "AAL100" (already ICAO, unchanged)
 *   "BA456" → "BAW456"
 *   "B6123" → "JBU123" (alphanumeric IATA codes)
 *
 * @param callsign - The flight callsign (e.g., "UA100", "AAL100")
 * @returns The callsign with ICAO prefix
 */
export function convertIataToIcao(callsign: string): string {
  const upper = callsign.toUpperCase();

  // Already has 3-letter ICAO prefix - return unchanged
  if (/^[A-Z]{3}\d/.test(upper)) return callsign;

  // Match 2-char IATA prefix (alphanumeric like B6, F9, G4) followed by flight number
  const match = upper.match(/^([A-Z0-9]{2})(\d+.*)$/);
  if (!match) return callsign;

  const icaoCode = IATA_TO_ICAO[match[1]];
  return icaoCode ? icaoCode + match[2] : callsign;
}
