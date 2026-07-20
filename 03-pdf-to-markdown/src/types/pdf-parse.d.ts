// 为 pdf-parse v1.1.1 的子路径导入编写的类型声明
// 绕过 index.js 的 module.parent ESM 兼容性 bug
// 直接从 lib/pdf-parse.js 导入核心解析函数
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: {
      PDFFormatVersion: string;
      IsAcroFormPresent: boolean;
      IsXFAPresent: boolean;
      Title?: string;
      Author?: string;
      Subject?: string;
      Keywords?: string;
      Creator?: string;
      Producer?: string;
      CreationDate?: string;
      ModDate?: string;
      [key: string]: any;
    };
    metadata: any;
    text: string;
    version: string;
  }

  function PDFParse(
    dataBuffer: Buffer,
    options?: {
      pagerender?: (pageData: any) => Promise<string>;
      max?: number;
      version?: string;
    }
  ): Promise<PDFParseResult>;

  export default PDFParse;
}
