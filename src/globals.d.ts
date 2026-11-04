declare const __GLOWCARD_VERSION__: string;

interface CustomCardEntry {
  type: string;
  name: string;
  description?: string;
  preview?: boolean;
  documentationURL?: string;
}

interface Window {
  customCards?: CustomCardEntry[];
}

declare module '*.woff2' {
  const dataUrl: string;
  export default dataUrl;
}
