type PacketRow = Record<string, any>;
export type PacketCatalogNode = {
  row: PacketRow;
  children: PacketCatalogNode[];
};
export function packetCatalogTree(rows: PacketRow[], packetID: number | string): PacketCatalogNode[];
export function packetCatalogChapters(rows: PacketRow[], packetID: number | string): PacketCatalogNode[];
export function packetChapterRequestID(rows: PacketRow[], selected: PacketRow): number | string;
