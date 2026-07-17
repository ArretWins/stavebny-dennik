export function countPdfPageObjects(binary: string): number { return binary.match(/\/Type\s*\/Page\b/g)?.length ?? 0; }
