/**
 * Airline directory: IATA code, ICAO code (used in ADS-B callsigns), and name.
 * Lets users pick "United Airlines (UA)" + flight number, and lets us convert
 * "UA1403" into the ADS-B callsign "UAL1403".
 */
export interface Airline {
  iata: string;
  icao: string;
  name: string;
}

export const AIRLINES: Airline[] = [
  { iata: "AA", icao: "AAL", name: "American Airlines" },
  { iata: "UA", icao: "UAL", name: "United Airlines" },
  { iata: "DL", icao: "DAL", name: "Delta Air Lines" },
  { iata: "WN", icao: "SWA", name: "Southwest Airlines" },
  { iata: "B6", icao: "JBU", name: "JetBlue" },
  { iata: "AS", icao: "ASA", name: "Alaska Airlines" },
  { iata: "NK", icao: "NKS", name: "Spirit Airlines" },
  { iata: "F9", icao: "FFT", name: "Frontier Airlines" },
  { iata: "HA", icao: "HAL", name: "Hawaiian Airlines" },
  { iata: "G4", icao: "AAY", name: "Allegiant Air" },
  { iata: "SY", icao: "SCX", name: "Sun Country Airlines" },
  { iata: "MX", icao: "MXY", name: "Breeze Airways" },
  { iata: "AC", icao: "ACA", name: "Air Canada" },
  { iata: "WS", icao: "WJA", name: "WestJet" },
  { iata: "TS", icao: "TSC", name: "Air Transat" },
  { iata: "PD", icao: "POE", name: "Porter Airlines" },
  { iata: "F8", icao: "FLE", name: "Flair Airlines" },
  { iata: "4N", icao: "ANT", name: "Air North" },
  { iata: "AM", icao: "AMX", name: "Aeroméxico" },
  { iata: "Y4", icao: "VOI", name: "Volaris" },
  { iata: "VB", icao: "VIV", name: "Viva Aerobus" },
  { iata: "CM", icao: "CMP", name: "Copa Airlines" },
  { iata: "AV", icao: "AVA", name: "Avianca" },
  { iata: "LA", icao: "LAN", name: "LATAM Airlines" },
  { iata: "JJ", icao: "TAM", name: "LATAM Brasil" },
  { iata: "G3", icao: "GLO", name: "Gol Linhas Aéreas" },
  { iata: "AD", icao: "AZU", name: "Azul" },
  { iata: "AR", icao: "ARG", name: "Aerolíneas Argentinas" },
  { iata: "BA", icao: "BAW", name: "British Airways" },
  { iata: "VS", icao: "VIR", name: "Virgin Atlantic" },
  { iata: "EI", icao: "EIN", name: "Aer Lingus" },
  { iata: "AF", icao: "AFR", name: "Air France" },
  { iata: "A5", icao: "HOP", name: "Air France Hop" },
  { iata: "KL", icao: "KLM", name: "KLM" },
  { iata: "HV", icao: "TRA", name: "Transavia" },
  { iata: "LH", icao: "DLH", name: "Lufthansa" },
  { iata: "LX", icao: "SWR", name: "Swiss" },
  { iata: "OS", icao: "AUA", name: "Austrian Airlines" },
  { iata: "SN", icao: "BEL", name: "Brussels Airlines" },
  { iata: "EW", icao: "EWG", name: "Eurowings" },
  { iata: "DE", icao: "CFG", name: "Condor" },
  { iata: "X3", icao: "TUI", name: "TUI fly Germany" },
  { iata: "BY", icao: "TOM", name: "TUI Airways (UK)" },
  { iata: "OR", icao: "TFL", name: "TUI fly Netherlands" },
  { iata: "AY", icao: "FIN", name: "Finnair" },
  { iata: "SK", icao: "SAS", name: "SAS Scandinavian" },
  { iata: "DY", icao: "NOZ", name: "Norwegian" },
  { iata: "D8", icao: "IBK", name: "Norwegian Air Intl" },
  { iata: "FI", icao: "ICE", name: "Icelandair" },
  { iata: "IB", icao: "IBE", name: "Iberia" },
  { iata: "UX", icao: "AEA", name: "Air Europa" },
  { iata: "VY", icao: "VLG", name: "Vueling" },
  { iata: "TP", icao: "TAP", name: "TAP Air Portugal" },
  { iata: "AZ", icao: "ITY", name: "ITA Airways" },
  { iata: "FR", icao: "RYR", name: "Ryanair" },
  { iata: "U2", icao: "EZY", name: "easyJet" },
  { iata: "W6", icao: "WZZ", name: "Wizz Air" },
  { iata: "W4", icao: "WMT", name: "Wizz Air Malta" },
  { iata: "LO", icao: "LOT", name: "LOT Polish Airlines" },
  { iata: "OK", icao: "CSA", name: "Czech Airlines" },
  { iata: "QS", icao: "TVS", name: "Smartwings" },
  { iata: "LG", icao: "LGL", name: "Luxair" },
  { iata: "KM", icao: "AMC", name: "KM Malta Airlines" },
  { iata: "JU", icao: "ASL", name: "Air Serbia" },
  { iata: "RO", icao: "ROT", name: "TAROM" },
  { iata: "BT", icao: "BTI", name: "airBaltic" },
  { iata: "OU", icao: "CTN", name: "Croatia Airlines" },
  { iata: "PS", icao: "AUI", name: "Ukraine International" },
  { iata: "TK", icao: "THY", name: "Turkish Airlines" },
  { iata: "PC", icao: "PGT", name: "Pegasus Airlines" },
  { iata: "A3", icao: "AEE", name: "Aegean Airlines" },
  { iata: "LY", icao: "ELY", name: "El Al" },
  { iata: "IZ", icao: "AIZ", name: "Arkia" },
  { iata: "6H", icao: "ISR", name: "Israir" },
  { iata: "EK", icao: "UAE", name: "Emirates" },
  { iata: "EY", icao: "ETD", name: "Etihad Airways" },
  { iata: "QR", icao: "QTR", name: "Qatar Airways" },
  { iata: "SV", icao: "SVA", name: "Saudia" },
  { iata: "FZ", icao: "FDB", name: "flydubai" },
  { iata: "G9", icao: "ABY", name: "Air Arabia" },
  { iata: "WY", icao: "OMA", name: "Oman Air" },
  { iata: "GF", icao: "GFA", name: "Gulf Air" },
  { iata: "KU", icao: "KAC", name: "Kuwait Airways" },
  { iata: "ME", icao: "MEA", name: "Middle East Airlines" },
  { iata: "MS", icao: "MSR", name: "EgyptAir" },
  { iata: "RJ", icao: "RJA", name: "Royal Jordanian" },
  { iata: "AT", icao: "RAM", name: "Royal Air Maroc" },
  { iata: "TU", icao: "TAR", name: "Tunisair" },
  { iata: "AH", icao: "DAH", name: "Air Algérie" },
  { iata: "ET", icao: "ETH", name: "Ethiopian Airlines" },
  { iata: "KQ", icao: "KQA", name: "Kenya Airways" },
  { iata: "SA", icao: "SAA", name: "South African Airways" },
  { iata: "MK", icao: "MAU", name: "Air Mauritius" },
  { iata: "HM", icao: "SEY", name: "Air Seychelles" },
  { iata: "PK", icao: "PIA", name: "Pakistan International" },
  { iata: "AI", icao: "AIC", name: "Air India" },
  { iata: "6E", icao: "IGO", name: "IndiGo" },
  { iata: "UK", icao: "VTI", name: "Vistara" },
  { iata: "UL", icao: "ALK", name: "SriLankan Airlines" },
  { iata: "BG", icao: "BBC", name: "Biman Bangladesh" },
  { iata: "TG", icao: "THA", name: "Thai Airways" },
  { iata: "VN", icao: "HVN", name: "Vietnam Airlines" },
  { iata: "PR", icao: "PAL", name: "Philippine Airlines" },
  { iata: "MH", icao: "MAS", name: "Malaysia Airlines" },
  { iata: "GA", icao: "GIA", name: "Garuda Indonesia" },
  { iata: "SQ", icao: "SIA", name: "Singapore Airlines" },
  { iata: "TR", icao: "TGW", name: "Scoot" },
  { iata: "CX", icao: "CPA", name: "Cathay Pacific" },
  { iata: "CI", icao: "CAL", name: "China Airlines" },
  { iata: "BR", icao: "EVA", name: "EVA Air" },
  { iata: "CZ", icao: "CSN", name: "China Southern" },
  { iata: "MU", icao: "CES", name: "China Eastern" },
  { iata: "CA", icao: "CCA", name: "Air China" },
  { iata: "HU", icao: "CHH", name: "Hainan Airlines" },
  { iata: "NH", icao: "ANA", name: "ANA All Nippon" },
  { iata: "JL", icao: "JAL", name: "Japan Airlines" },
  { iata: "KE", icao: "KAL", name: "Korean Air" },
  { iata: "OZ", icao: "AAR", name: "Asiana Airlines" },
  { iata: "QF", icao: "QFA", name: "Qantas" },
  { iata: "NZ", icao: "ANZ", name: "Air New Zealand" },
  { iata: "VA", icao: "VOZ", name: "Virgin Australia" },
  { iata: "JQ", icao: "JST", name: "Jetstar" },
  { iata: "FJ", icao: "FJI", name: "Fiji Airways" },
  { iata: "TN", icao: "THT", name: "Air Tahiti Nui" },
  { iata: "CG", icao: "TOK", name: "PNG Air" },
];

export const AIRLINE_IATA_TO_ICAO: Record<string, string> = Object.fromEntries(
  AIRLINES.map((a) => [a.iata, a.icao])
);

const ICAO_CODES = new Set(AIRLINES.map((a) => a.icao));

/**
 * Normalize a user-typed flight identifier into candidate ADS-B callsigns.
 * "UA 84" → ["UAL84", "UA84"], "UAL84" → ["UAL84"], "LY008" → ["ELY8", "LY008"]
 */
export function candidateCallsigns(input: string): string[] {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const out: string[] = [];

  const iataMatch = raw.match(/^([A-Z]{2}|[A-Z][0-9]|[0-9][A-Z])0*([0-9]{1,4}[A-Z]?)$/);
  if (iataMatch) {
    const icao = AIRLINE_IATA_TO_ICAO[iataMatch[1]];
    if (icao) out.push(`${icao}${iataMatch[2]}`);
  }
  const icaoMatch = raw.match(/^([A-Z]{3})0*([0-9]{1,4}[A-Z]?)$/);
  if (icaoMatch && ICAO_CODES.has(icaoMatch[1])) out.push(`${icaoMatch[1]}${icaoMatch[2]}`);

  if (!out.includes(raw)) out.push(raw);
  return out;
}
