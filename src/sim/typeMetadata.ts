export interface EntityTypeMetadata {
  name: string;
  hex: string;
}

const TYPE_METADATA: EntityTypeMetadata[] = [
  { name: "Coral", hex: "#f56647" },
  { name: "Azure", hex: "#42bcf5" },
  { name: "Gold", hex: "#f2d44f" },
  { name: "Mint", hex: "#7be694" }
];

export function getEntityTypeMetadata(index: number): EntityTypeMetadata {
  return TYPE_METADATA[index] ?? {
    name: `Type ${index + 1}`,
    hex: "#c6d2df"
  };
}
