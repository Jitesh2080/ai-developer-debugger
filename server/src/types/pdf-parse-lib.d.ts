// pdf-parse ships types only for its package root, not the internal lib entry
// we import to avoid its debug harness. Declare the minimal shape we use.
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
