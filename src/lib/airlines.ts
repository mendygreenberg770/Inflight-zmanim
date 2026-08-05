/**
 * IATA → ICAO airline designator mapping for common carriers, so users can
 * type "UA84" / "LY 8" and we can look up the ADS-B callsign ("UAL84", "ELY8").
 */
export const AIRLINE_IATA_TO_ICAO: Record<string, string> = {
  AA: "AAL", UA: "UAL", DL: "DAL", WN: "SWA", B6: "JBU", AS: "ASA", NK: "NKS",
  F9: "FFT", HA: "HAL", G4: "AAY", SY: "SCX", AC: "ACA", WS: "WJA", AM: "AMX",
  BA: "BAW", VS: "VIR", AF: "AFR", KL: "KLM", LH: "DLH", LX: "SWR", OS: "AUA",
  SN: "BEL", EW: "EWG", DE: "CFG", AY: "FIN", SK: "SAS", DY: "NOZ", D8: "IBK",
  IB: "IBE", UX: "AEA", VY: "VLG", TP: "TAP", AZ: "ITY", FR: "RYR", U2: "EZY",
  W6: "WZZ", LO: "LOT", OK: "CSA", TK: "THY", PC: "PGT", A3: "AEE", EL: "ELB",
  LY: "ELY", IZ: "AIZ", "6H": "ISR", EK: "UAE", EY: "ETD", QR: "QTR", SV: "SVA",
  MS: "MSR", RJ: "RJA", ET: "ETH", KQ: "KQA", SA: "SAA", QF: "QFA", NZ: "ANZ",
  VA: "VOZ", JQ: "JST", NH: "ANA", JL: "JAL", KE: "KAL", OZ: "AAR", CX: "CPA",
  CI: "CAL", BR: "EVA", SQ: "SIA", TR: "TGW", MH: "MAS", GA: "GIA", TG: "THA",
  VN: "HVN", PR: "PAL", CZ: "CSN", MU: "CES", CA: "CCA", HU: "CHH", AI: "AIC",
  "6E": "IGO", UK: "VTI", LA: "LAN", JJ: "TAM", G3: "GLO", AD: "AZU", AR: "ARG",
  CM: "CMP", AV: "AVA", MX: "MXY", Y4: "VOI", VB: "VIV", TS: "TSC", PD: "POE",
  F8: "FLE", "4N": "ANT", MT: "TCX", BY: "TOM", X3: "TUI", OR: "TFL", HV: "TRA",
  QS: "TVS", EI: "EIN", FI: "ICE", PS: "AUI", LG: "LGL", A5: "HOP", KM: "AMC",
  JU: "ASL", RO: "ROT", BT: "BTI", OU: "CTN", FZ: "FDB", G9: "ABY", WY: "OMA",
  GF: "GFA", KU: "KAC", ME: "MEA", PK: "PIA", UL: "ALK", BG: "BBC", CG: "TOK",
  FJ: "FJI", HM: "SEY", MK: "MAU", TN: "THT", AT: "RAM", TU: "TAR", AH: "DAH",
  MW: "MWI", W4: "WMT", "5W": "WEA", ZB: "GBA",
};

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
  if (icaoMatch) out.push(`${icaoMatch[1]}${icaoMatch[2]}`);

  if (!out.includes(raw)) out.push(raw);
  return out;
}
